import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import { ALPHA_III, buildRocketConfig, parseEng } from '@fds/rocket-design';

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
