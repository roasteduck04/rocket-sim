/**
 * Landing-sim feature (docs/superpowers/specs/2026-07-04-landing-sim-design.md):
 * entry-burn config schema, the entryDescent guidance phase machine, and the
 * §10.2.4-style convergence sweep extended to high-altitude entries.
 */
import { describe, it, expect } from 'vitest';
import {
  loadAeroTable,
  loadRocketYaml,
  loadThrustCurve,
  entryDescentGuidance,
  initialEntryState,
  runEntryDescentSim,
  runRocketSim,
} from '@fds/rocket-sim';
import type { EntryScenario, GuidanceMode, RocketConfig } from '@fds/rocket-sim';

const THRUST_CSV = '0,210000\n150,210000';
const AERO_CSV =
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0';

const YAML = `
name: "Entry Test Booster"
mass:
  dry_kg: 2200
  propellant_kg: 8800
  dry_cg_from_nose_m: 6.1
  propellant_cg_from_nose_m: 4.8
  tank_bottom_from_nose_m: 8.8
  tank_radius_m: 0.6
  dry_inertia_kgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 }
geometry:
  length_m: 12.0
  diameter_m: 1.2
  ref_area_m2: 1.131
propulsion:
  thrust_curve_file: "unused"
  isp_sea_level_s: 282
  isp_vacuum_s: 311
  gimbal: { max_deflection_deg: 6.0, max_slew_rate_dps: 20, position_from_nose_m: 11.8 }
  throttle: { min: 0.4, max: 1.0 }
aero:
  table_file: "unused"
  cp_from_nose_m: 5.4
control:
  pid_pitch: { kp: 0.8, ki: 0.05, kd: 0.6 }
  pid_yaw:   { kp: 0.8, ki: 0.05, kd: 0.6 }
  landing_target:
    touchdown_vz_max_mps: 2.0
    pad_radius_m: 20
    touchdown_tilt_max_deg: 4.0
    rud_impact_speed_mps: 30
  descent:
    rated_thrust_n: 80000
    ignition_margin: 0.3
    touchdown_speed_mps: 1.0
    max_tilt_deg: 8.0
    pid_vz:  { kp: 0.15, ki: 0.05, kd: 0.0 }
    pid_pos: { kp: 0.004, ki: 0.0, kd: 0.03 }
    entry_burn:
      ignite_altitude_m: 14900
      target_speed_mps: 200
`;

describe('entry-burn config schema', () => {
  it('parses entry_burn and the pad/verdict fields', () => {
    const cfg = loadRocketYaml(YAML, { thrustCurveCsv: THRUST_CSV, aeroTableCsv: AERO_CSV });
    expect(cfg.control?.descent?.entryBurn).toEqual({
      igniteAltitudeM: 14900,
      targetSpeedMps: 200,
    });
    expect(cfg.control?.landingTarget?.padRadiusM).toBe(20);
    expect(cfg.control?.landingTarget?.touchdownTiltMaxRad).toBeCloseTo((4 * Math.PI) / 180, 10);
    expect(cfg.control?.landingTarget?.rudImpactSpeedMps).toBe(30);
  });

  it('defaults pad/verdict fields and omits entryBurn when absent', () => {
    const noExtras = YAML
      .replace(/\n    entry_burn:[\s\S]*?target_speed_mps: 200\n/, '\n')
      .replace('    pad_radius_m: 20\n    touchdown_tilt_max_deg: 4.0\n    rud_impact_speed_mps: 30\n', '');
    const cfg = loadRocketYaml(noExtras, { thrustCurveCsv: THRUST_CSV, aeroTableCsv: AERO_CSV });
    expect(cfg.control?.descent?.entryBurn).toBeUndefined();
    expect(cfg.control?.landingTarget?.padRadiusM).toBe(15);
    expect(cfg.control?.landingTarget?.touchdownTiltMaxRad).toBeCloseTo((5 * Math.PI) / 180, 10);
    expect(cfg.control?.landingTarget?.rudImpactSpeedMps).toBe(25);
  });
});

// Zero-coefficient aero table: isolates guidance + propulsion + gravity,
// following the §10.2.4 precedent (tail-first flight is outside the shipped
// Barrowman table's AoA validity — see rocket-landing.test.ts header).
const zeroAero = loadAeroTable(AERO_CSV);

/** 80 kN landing engine: comfortable T/W ≈ 1.7 at the 4700 kg entry mass. */
const CFG: RocketConfig = loadRocketYaml(YAML, {
  thrustCurveCsv: THRUST_CSV,
  aeroTableCsv: AERO_CSV,
});
CFG.aero = { table: zeroAero, cpFromNoseM: 5.4 };

const ENTRY: EntryScenario = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-80 * Math.PI) / 180,
  downrangeM: 500,
  propellantKg: 2500,
};

describe('entryDescentGuidance phase machine', () => {
  it('coasts (throttle 0) above the ignite altitude', () => {
    const g = entryDescentGuidance(CFG);
    const s = initialEntryState(CFG, { ...ENTRY, altitudeM: 15000 });
    const cmd = g.command(0, s);
    expect(g.phase).toBe('coast');
    expect(cmd.throttle).toBe(0);
    expect(cmd.deltaP).toBe(0);
    expect(g.entryBurnIgnitionTime).toBeNull();
  });

  it('ignites retrograde at full throttle below the ignite altitude', () => {
    const g = entryDescentGuidance(CFG);
    g.command(0, initialEntryState(CFG, { ...ENTRY, altitudeM: 15000 }));
    const cmd = g.command(0.01, initialEntryState(CFG, { ...ENTRY, altitudeM: 11900 }));
    expect(g.phase).toBe('entryBurn');
    expect(g.entryBurnIgnitionTime).toBe(0.01);
    expect(cmd.throttle).toBe(CFG.propulsion.throttle.max);
  });

  it('cuts off below the target speed and delegates to powered descent', () => {
    const g = entryDescentGuidance(CFG);
    g.command(0, initialEntryState(CFG, { ...ENTRY, altitudeM: 11900 }));
    // Same altitude, speed now below the 200 m/s target → cutoff + delegation.
    const slow = initialEntryState(CFG, { ...ENTRY, altitudeM: 11000, speedMps: 100 });
    g.command(0.01, slow);
    expect(g.phase).toBe('descent');
    expect(g.entryBurnCutoffTime).toBe(0.01);
  });

  it('skips straight to descent when entry_burn is absent (graceful degradation)', () => {
    const noBurn: RocketConfig = {
      ...CFG,
      control: {
        ...CFG.control!,
        descent: { ...CFG.control!.descent!, entryBurn: undefined },
      },
    };
    const g = entryDescentGuidance(noBurn);
    expect(g.phase).toBe('descent');
  });
});

describe('entry-descent landing convergence (spec §8)', () => {
  // Inside the capture region for the 80 kN test engine at these masses; the
  // envelope brackets the UI's default ranges (spec §8: "the Section-10
  // convergence pattern, extended to this feature's entry ranges").
  // Scenario tuning (plan amendment, Task 3): "higher & faster" is the hottest
  // entry the 80 kN engine closes — a lighter vehicle (2200 kg propellant)
  // decelerates harder, cutting the burn off high enough for the lateral
  // divert; "offset 2 km" flies heavier (3200 kg) to shorten the unpowered
  // coast between entry-burn cutoff and landing ignition (no thrust ⇒ no TVC
  // authority, so coast drift is uncorrectable) and carries a relaxed 200 m
  // miss bound for its 2 km divert.
  const sweep: Array<EntryScenario & { label: string; missMaxM?: number }> = [
    { label: 'reference entry', ...ENTRY },
    { label: 'lower & slower', ...ENTRY, altitudeM: 10000, speedMps: 300 },
    { label: 'higher & faster', ...ENTRY, altitudeM: 16000, speedMps: 420, propellantKg: 2200 },
    { label: 'steep', ...ENTRY, gammaRad: (-88 * Math.PI) / 180 },
    { label: 'offset 2 km', ...ENTRY, downrangeM: 2000, propellantKg: 3200, missMaxM: 200 },
  ];
  const vzMax = CFG.control!.landingTarget!.touchdownVzMaxMps;

  for (const sc of sweep) {
    it(`lands within the touchdown limit — ${sc.label}`, () => {
      const { result, entryBurnIgnitionTime, landingIgnitionTime } =
        runEntryDescentSim(CFG, sc, { sampleEvery: 100 });
      const landing = result.summary.landing!;
      expect(landing.touchedDown).toBe(true);
      expect(entryBurnIgnitionTime).not.toBeNull();
      expect(landingIgnitionTime).not.toBeNull();
      expect(Math.abs(landing.touchdownVz)).toBeLessThanOrEqual(vzMax);
      expect(landing.missDistance).toBeLessThan(sc.missMaxM ?? 100);
      expect(result.finalState.mass).toBeGreaterThan(CFG.mass.dryKg); // propellant left
    });
  }
});

describe('entry-burn effectiveness + determinism (spec §8)', () => {
  // Plan amendment (Task 3): the original maxQbar comparison's baseline premise
  // was inverted — "no entry burn" does not mean "no burn": the powered-descent
  // guidance ignites almost immediately and throttles the whole way down, so it
  // sees LOWER peak q̄ than the burn-coast-burn profile. The effectiveness
  // check is instead (a) the burn cuts off at its configured target speed, and
  // (b) an unguided ballistic coast (throttle 0 throughout) is far faster at
  // the same altitude — the speed the burn actually removed.
  it('cuts off at the target speed, far below the unguided ballistic coast', () => {
    const target = CFG.control!.descent!.entryBurn!.targetSpeedMps;
    const { result, entryBurnCutoffTime } = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 1 });
    expect(entryBurnCutoffTime).not.toBeNull();
    // Frame at cutoff: guidance cuts on the first step where |v| <= target, and
    // full-throttle deceleration is ≲30 m/s² ⇒ ≲0.3 m/s per 0.01 s step, so the
    // recorded speed sits just under the target; ±5% is generous headroom.
    const atCutoff = result.telemetry.reduce((best, f) =>
      Math.abs(f.t - entryBurnCutoffTime!) < Math.abs(best.t - entryBurnCutoffTime!) ? f : best,
    );
    expect(Math.abs(atCutoff.speed - target)).toBeLessThanOrEqual(0.05 * target);

    // Unguided ballistic baseline: same entry state, engine off the whole way
    // (throttle 0 ⇒ zero thrust, and the zero-coefficient aero table means the
    // coast is pure gravity). At the cutoff altitude the coasting vehicle
    // should be carrying far more speed than the post-burn vehicle.
    const ballistic: GuidanceMode = {
      command: () => ({ deltaP: 0, deltaY: 0, throttle: 0 }),
    };
    const coast = runRocketSim(CFG, ballistic, {
      initialState: initialEntryState(CFG, ENTRY),
      maxTime: 600,
      sampleEvery: 1,
      groundConstraint: true,
    });
    const atSameAltitude = coast.telemetry.reduce((best, f) =>
      Math.abs(f.altitude - atCutoff.altitude) < Math.abs(best.altitude - atCutoff.altitude)
        ? f
        : best,
    );
    expect(atSameAltitude.speed).toBeGreaterThan(1.5 * atCutoff.speed);
  });

  it('is bit-reproducible: two identical runs produce identical telemetry', () => {
    const a = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 50 });
    const b = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 50 });
    expect(JSON.stringify(a.result.telemetry)).toBe(JSON.stringify(b.result.telemetry));
    expect(a.entryBurnIgnitionTime).toBe(b.entryBurnIgnitionTime);
    expect(a.entryBurnCutoffTime).toBe(b.entryBurnCutoffTime);
  });
});
