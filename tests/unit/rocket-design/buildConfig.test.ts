import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import { ALPHA_III, buildRocketConfig, parseEng } from '@fds/rocket-design';
import type { RocketDesign } from '@fds/rocket-design';

const c6 = parseEng('Estes_C6', readFileSync(fileURLToPath(new URL('../../../data/motors/Estes_C6.eng', import.meta.url)), 'utf8'));

describe('buildRocketConfig → runRocketSim', () => {
  const cfg = buildRocketConfig(ALPHA_III, c6);

  it('produces a sim-valid config (mass + propellant + complete aero table)', () => {
    expect(cfg.mass.dryKg).toBeGreaterThan(0);
    expect(cfg.mass.propellantKg).toBeCloseTo(c6.propellantKg, 6);
    expect(cfg.aero.cpFromNoseM).toBeGreaterThan(cfg.mass.dryCgFromNoseM); // stable: CP aft of CG
  });

  it('flies to a finite, positive apogee with no NaN', () => {
    const res = runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 60 });
    expect(Number.isFinite(res.summary.apogeeAltitude)).toBe(true);
    expect(res.summary.apogeeAltitude).toBeGreaterThan(10);
    expect(res.summary.apogeeAltitude).toBeLessThan(2000);
    expect(res.telemetry.every((f) => Number.isFinite(f.altitude))).toBe(true);
  });
});

describe('buildRocketConfig — motor longer than the airframe', () => {
  // A stubby design (nose + short tube + fins) whose overall length is well
  // under the C6's 70 mm — not reachable from the UI, but the builder is a
  // public API. `motorFore` must clamp at 0 rather than go negative.
  const stubby: RocketDesign = {
    name: 'Stub',
    parts: [
      { kind: 'nose', shape: 'ogive', lengthM: 0.02, baseRadiusM: 0.0123, wallThicknessM: 0.0015, material: 'plastic' },
      { kind: 'tube', lengthM: 0.02, outerRadiusM: 0.0123, wallThicknessM: 0.0003, material: 'kraft-tube' },
      { kind: 'fins', count: 3, rootChordM: 0.02, tipChordM: 0.01, semiSpanM: 0.02, sweepM: 0.01, thicknessM: 0.0025, material: 'plastic' },
    ],
    motorId: 'Estes_C6',
  };

  it('clamps the propellant fore station to 0 instead of going negative', () => {
    const cfg = buildRocketConfig(stubby, c6);
    expect(cfg.geometry.lengthM).toBeLessThan(c6.lengthM); // design shorter than the motor
    expect(cfg.mass.tankBottomFromNoseM).toBe(cfg.geometry.lengthM); // motorAft = overall length
    const motorFore = 2 * cfg.mass.propellantCgFromNoseM - cfg.mass.tankBottomFromNoseM;
    expect(motorFore).toBeCloseTo(0, 9);
    expect(motorFore).toBeGreaterThanOrEqual(0);
  });
});
