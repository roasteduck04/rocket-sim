/**
 * Rocket config loader — Phase 3 `control` block parsing (README §8.1
 * `control.pid_pitch`/`pid_yaw`; roll toggle default off). The rest of the
 * loader is exercised end-to-end by the golden-run test against the reference
 * YAML.
 */
import { describe, it, expect } from 'vitest';
import { loadRocketYaml } from '@fds/rocket-sim';

const baseYaml = `
name: "Loader Test"
mass:
  dry_kg: 2200
  propellant_kg: 8800
  dry_cg_from_nose_m: 6.1
  propellant_cg_from_nose_m: 4.8
  tank_bottom_from_nose_m: 8.8
  dry_inertia_kgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 }
geometry:
  length_m: 12.0
  diameter_m: 1.2
  ref_area_m2: 1.131
propulsion:
  isp_sea_level_s: 282
  isp_vacuum_s: 311
  gimbal:
    max_deflection_deg: 6.0
    max_slew_rate_dps: 20
    position_from_nose_m: 11.8
aero:
  cp_from_nose_m: 5.4
`;

const tables = {
  thrustCurveCsv: '0,0\n1,210000\n2,0',
  aeroTableCsv:
    'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
};

const controlBlock = `
control:
  pid_pitch: { kp: 0.8, ki: 0.05, kd: 0.6 }
  pid_yaw:   { kp: 0.7, ki: 0.04, kd: 0.5 }
`;

describe('loadRocketYaml control block (README §8.1, Phase 3)', () => {
  it('parses per-channel PID gains', () => {
    const cfg = loadRocketYaml(baseYaml + controlBlock, tables);
    expect(cfg.control).toBeDefined();
    expect(cfg.control?.pidPitch).toEqual({ kp: 0.8, ki: 0.05, kd: 0.6 });
    expect(cfg.control?.pidYaw).toEqual({ kp: 0.7, ki: 0.04, kd: 0.5 });
  });

  it('roll control defaults to disabled (MVP stub, README §4.6)', () => {
    const cfg = loadRocketYaml(baseYaml + controlBlock, tables);
    expect(cfg.control?.rollControlEnabled).toBe(false);
  });

  it('reads an explicit roll_control_enabled flag', () => {
    const cfg = loadRocketYaml(
      baseYaml + controlBlock + '  roll_control_enabled: true\n',
      tables,
    );
    expect(cfg.control?.rollControlEnabled).toBe(true);
  });

  it('omitted control block → config without closed-loop control', () => {
    const cfg = loadRocketYaml(baseYaml, tables);
    expect(cfg.control).toBeUndefined();
  });

  it('throws a descriptive error when a gain is missing', () => {
    const bad = baseYaml + '\ncontrol:\n  pid_pitch: { kp: 0.8, ki: 0.05 }\n  pid_yaw: { kp: 0.8, ki: 0.05, kd: 0.6 }\n';
    expect(() => loadRocketYaml(bad, tables)).toThrow(/control\.pid_pitch.*kd|kd.*control\.pid_pitch/);
  });

  it('throws when roll_control_enabled is not a boolean', () => {
    const bad = baseYaml + controlBlock + '  roll_control_enabled: "yes"\n';
    expect(() => loadRocketYaml(bad, tables)).toThrow(/roll_control_enabled/);
  });
});

const descentBlock = `  descent:
    rated_thrust_n: 50000
    ignition_margin: 0.3
    touchdown_speed_mps: 1.5
    max_tilt_deg: 10
    pid_vz:  { kp: 0.15, ki: 0.05, kd: 0 }
    pid_pos: { kp: 0.004, ki: 0, kd: 0.03 }
`;

describe('loadRocketYaml descent block (README §8.1 + §4.6 mode 3, Phase 4)', () => {
  it('parses the powered-descent guidance parameters (angles converted to rad)', () => {
    const cfg = loadRocketYaml(baseYaml + controlBlock + descentBlock, tables);
    const d = cfg.control?.descent;
    expect(d).toBeDefined();
    expect(d?.ratedThrustN).toBe(50000);
    expect(d?.ignitionMargin).toBe(0.3);
    expect(d?.touchdownSpeedMps).toBe(1.5);
    expect(d?.maxTiltRad).toBeCloseTo((10 * Math.PI) / 180, 12);
    expect(d?.pidVz).toEqual({ kp: 0.15, ki: 0.05, kd: 0 });
    expect(d?.pidPos).toEqual({ kp: 0.004, ki: 0, kd: 0.03 });
  });

  it('applies defaults for margin, touchdown speed, and tilt limit', () => {
    const minimal =
      baseYaml +
      controlBlock +
      '  descent:\n    rated_thrust_n: 50000\n    pid_vz: { kp: 0.15, ki: 0.05, kd: 0 }\n    pid_pos: { kp: 0.004, ki: 0, kd: 0.03 }\n';
    const d = loadRocketYaml(minimal, tables).control?.descent;
    expect(d?.ignitionMargin).toBe(0.3);
    expect(d?.touchdownSpeedMps).toBe(1.0);
    expect(d?.maxTiltRad).toBeCloseTo((8 * Math.PI) / 180, 12);
  });

  it('parses landing_target (flat-Earth NED metres from lat/lon, A14) with §8.1 defaults', () => {
    const withTarget =
      baseYaml +
      controlBlock +
      descentBlock +
      '  landing_target: { lat: 0.0, lon: 0.0, touchdown_vz_max_mps: 1.8 }\n';
    const t = loadRocketYaml(withTarget, tables).control?.landingTarget;
    expect(t?.northM).toBe(0);
    expect(t?.eastM).toBe(0);
    expect(t?.touchdownVzMaxMps).toBe(1.8);

    // Omitted target → origin, 2 m/s (§8.1 reference values).
    const none = loadRocketYaml(baseYaml + controlBlock + descentBlock, tables).control?.landingTarget;
    expect(none).toEqual({
      northM: 0,
      eastM: 0,
      touchdownVzMaxMps: 2.0,
      padRadiusM: 15,
      touchdownTiltMaxRad: (5 * Math.PI) / 180,
      rudImpactSpeedMps: 25,
    });
  });

  it('omitted descent block → control config without descent guidance', () => {
    const cfg = loadRocketYaml(baseYaml + controlBlock, tables);
    expect(cfg.control?.descent).toBeUndefined();
  });

  it('throws when rated_thrust_n or a descent PID is missing', () => {
    const noThrust =
      baseYaml +
      controlBlock +
      '  descent:\n    pid_vz: { kp: 0.15, ki: 0.05, kd: 0 }\n    pid_pos: { kp: 0.004, ki: 0, kd: 0.03 }\n';
    expect(() => loadRocketYaml(noThrust, tables)).toThrow(/rated_thrust_n/);

    const noVz = baseYaml + controlBlock + '  descent:\n    rated_thrust_n: 50000\n    pid_pos: { kp: 0.004, ki: 0, kd: 0.03 }\n';
    expect(() => loadRocketYaml(noVz, tables)).toThrow(/pid_vz/);
  });
});
