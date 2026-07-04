/**
 * Rocket vehicle-config YAML loader (README §8.1 + plan A5/A7/A11).
 *
 * Parses the §8.1 schema, applies the ambiguity-resolving defaults (tank radius →
 * vehicle radius (A5); throttle band → 0.4–1.0 (A7); open-loop pitch-over kick
 * defaults), and converts gimbal / kick angles from degrees to radians. The
 * thrust curve and aero table are supplied as CSV text (the package stays
 * filesystem-free, exactly like `aircraft-sim`); the YAML's `*_file` fields are
 * treated as documentation only.
 */

import { load } from 'js-yaml';
import { degToRad, RE } from '@fds/physics-core';
import { loadThrustCurve } from './propulsion.js';
import { loadAeroTable } from './aero.js';
import type {
  ControlConfig,
  DescentGuidanceConfig,
  EntryBurnConfig,
  LandingTarget,
  RocketConfig,
} from './types.js';
import type { PidGains } from './control/pid.js';

type Dict = Record<string, unknown>;

const asObject = (v: unknown, ctx: string): Dict => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`rocket config: expected "${ctx}" to be a mapping`);
  }
  return v as Dict;
};

const req = (obj: Dict, key: string, ctx: string): number => {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`rocket config: missing or non-numeric required field "${ctx}.${key}"`);
  }
  return v;
};

const opt = (obj: Dict, key: string, def: number): number => {
  const v = obj[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`rocket config: field "${key}" must be a number`);
  }
  return v;
};

/** External table resources for {@link loadRocketYaml}. */
export interface RocketTables {
  /** Thrust curve CSV / `.eng` text (README §8.1 `thrust_curve_file`). */
  thrustCurveCsv: string;
  /** Aero table CSV text (README §8.1 `aero.table_file`). */
  aeroTableCsv: string;
}

/** Parse and validate a rocket vehicle config (README §8.1). */
export const loadRocketYaml = (yamlText: string, tables: RocketTables): RocketConfig => {
  const root = asObject(load(yamlText), 'rocket config root');
  const name = typeof root['name'] === 'string' ? (root['name'] as string) : 'unnamed';

  const massD = asObject(root['mass'], 'mass');
  const geomD = asObject(root['geometry'], 'geometry');
  const propD = asObject(root['propulsion'], 'propulsion');
  const aeroD = asObject(root['aero'], 'aero');
  const inertiaD = asObject(massD['dry_inertia_kgm2'], 'mass.dry_inertia_kgm2');
  const gimbalD = asObject(propD['gimbal'], 'propulsion.gimbal');

  const diameterM = req(geomD, 'diameter_m', 'geometry');

  const mass = {
    dryKg: req(massD, 'dry_kg', 'mass'),
    propellantKg: req(massD, 'propellant_kg', 'mass'),
    dryCgFromNoseM: req(massD, 'dry_cg_from_nose_m', 'mass'),
    propellantCgFromNoseM: req(massD, 'propellant_cg_from_nose_m', 'mass'),
    tankBottomFromNoseM: req(massD, 'tank_bottom_from_nose_m', 'mass'),
    tankRadiusM: opt(massD, 'tank_radius_m', diameterM / 2),
    dryInertiaKgm2: {
      Ixx: req(inertiaD, 'Ixx', 'mass.dry_inertia_kgm2'),
      Iyy: req(inertiaD, 'Iyy', 'mass.dry_inertia_kgm2'),
      Izz: req(inertiaD, 'Izz', 'mass.dry_inertia_kgm2'),
    },
  };

  const geometry = {
    lengthM: req(geomD, 'length_m', 'geometry'),
    diameterM,
    refAreaM2: req(geomD, 'ref_area_m2', 'geometry'),
  };

  const throttleD =
    propD['throttle'] !== undefined ? asObject(propD['throttle'], 'propulsion.throttle') : {};

  const propulsion = {
    thrustCurve: loadThrustCurve(tables.thrustCurveCsv),
    ispSeaLevelS: req(propD, 'isp_sea_level_s', 'propulsion'),
    ispVacuumS: req(propD, 'isp_vacuum_s', 'propulsion'),
    gimbal: {
      maxDeflectionRad: degToRad(req(gimbalD, 'max_deflection_deg', 'propulsion.gimbal')),
      maxSlewRateRps: degToRad(req(gimbalD, 'max_slew_rate_dps', 'propulsion.gimbal')),
      positionFromNoseM: req(gimbalD, 'position_from_nose_m', 'propulsion.gimbal'),
    },
    throttle: {
      min: opt(throttleD, 'min', 0.4),
      max: opt(throttleD, 'max', 1.0),
    },
  };

  const aero = {
    table: loadAeroTable(tables.aeroTableCsv),
    cpFromNoseM: req(aeroD, 'cp_from_nose_m', 'aero'),
  };

  const ascentD =
    root['ascent'] !== undefined ? asObject(root['ascent'], 'ascent') : {};
  const guidance = {
    kickStartS: opt(ascentD, 'kick_start_s', 8),
    kickDurationS: opt(ascentD, 'kick_duration_s', 2),
    kickDeflectionRad: degToRad(opt(ascentD, 'kick_deflection_deg', 1)),
  };

  // Closed-loop attitude control (README §8.1 `control`, Phase 3) — optional;
  // open-loop-only configs may omit the whole block.
  let control: ControlConfig | undefined;
  if (root['control'] !== undefined) {
    const controlD = asObject(root['control'], 'control');
    const pid = (owner: Dict, key: string, ctx: string): PidGains => {
      const d = asObject(owner[key], `${ctx}.${key}`);
      return {
        kp: req(d, 'kp', `${ctx}.${key}`),
        ki: req(d, 'ki', `${ctx}.${key}`),
        kd: req(d, 'kd', `${ctx}.${key}`),
      };
    };
    const roll = controlD['roll_control_enabled'];
    if (roll !== undefined && typeof roll !== 'boolean') {
      throw new Error('rocket config: "control.roll_control_enabled" must be a boolean');
    }

    // Powered-descent guidance parameters (README §4.6 mode 3, Phase 4 + A7).
    let descent: DescentGuidanceConfig | undefined;
    if (controlD['descent'] !== undefined) {
      const dD = asObject(controlD['descent'], 'control.descent');
      let entryBurn: EntryBurnConfig | undefined;
      if (dD['entry_burn'] !== undefined) {
        const eD = asObject(dD['entry_burn'], 'control.descent.entry_burn');
        entryBurn = {
          igniteAltitudeM: req(eD, 'ignite_altitude_m', 'control.descent.entry_burn'),
          targetSpeedMps: req(eD, 'target_speed_mps', 'control.descent.entry_burn'),
        };
      }
      descent = {
        ratedThrustN: req(dD, 'rated_thrust_n', 'control.descent'),
        ignitionMargin: opt(dD, 'ignition_margin', 0.3),
        touchdownSpeedMps: opt(dD, 'touchdown_speed_mps', 1.0),
        maxTiltRad: degToRad(opt(dD, 'max_tilt_deg', 8)),
        pidVz: pid(dD, 'pid_vz', 'control.descent'),
        pidPos: pid(dD, 'pid_pos', 'control.descent'),
        entryBurn,
      };
    }

    // Landing target (README §8.1): lat/lon mapped to flat-Earth local NED
    // metres about the pad origin (plan A14) — exact enough for the MVP's
    // km-scale descents near the origin.
    let landingTarget: LandingTarget | undefined;
    if (controlD['landing_target'] !== undefined || descent !== undefined) {
      const tD =
        controlD['landing_target'] !== undefined
          ? asObject(controlD['landing_target'], 'control.landing_target')
          : {};
      const latRad = degToRad(opt(tD, 'lat', 0));
      const lonRad = degToRad(opt(tD, 'lon', 0));
      landingTarget = {
        northM: RE * latRad,
        eastM: RE * lonRad * Math.cos(latRad),
        touchdownVzMaxMps: opt(tD, 'touchdown_vz_max_mps', 2.0),
        padRadiusM: opt(tD, 'pad_radius_m', 15),
        touchdownTiltMaxRad: degToRad(opt(tD, 'touchdown_tilt_max_deg', 5)),
        rudImpactSpeedMps: opt(tD, 'rud_impact_speed_mps', 25),
      };
    }

    control = {
      pidPitch: pid(controlD, 'pid_pitch', 'control'),
      pidYaw: pid(controlD, 'pid_yaw', 'control'),
      rollControlEnabled: roll === true,
      descent,
      landingTarget,
    };
  }

  return { name, mass, geometry, propulsion, aero, guidance, control };
};
