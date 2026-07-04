/**
 * Golden-run regression + determinism for the reference reentry
 * (README §1 "deterministic, testable physics"; plan Phase 5 golden run).
 *
 * The generic capsule (data/reentry-vehicles/generic-capsule.reentry.yaml,
 * loaded end-to-end through the YAML loader) enters mid-corridor: γ = −3.0°
 * at 7800 m/s, due East at the equator, full lift-up (bank 0). A compact
 * telemetry snapshot is compared against the checked-in
 * `reentry-reference.json`. Re-generate after an intentional physics change
 * with `REGEN_GOLDEN=1 npx vitest run tests/golden-runs/reentry-reference.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadReentryYaml, runReentry } from '@fds/reentry-sim';
import type { ReentryConfig, ReentryRun } from '@fds/reentry-sim';

const deg = (d: number): number => (d * Math.PI) / 180;

const capsule: ReentryConfig = loadReentryYaml(
  readFileSync(
    fileURLToPath(new URL('../../data/reentry-vehicles/generic-capsule.reentry.yaml', import.meta.url)),
    'utf8',
  ),
);

const runReference = (): ReentryRun =>
  runReentry(capsule, deg(-3.0), 7800, { sampleEvery: 10 });

interface Snap {
  t: number;
  h: number;
  V: number;
  gamma: number;
  qdotS: number;
  nLoad: number;
  downrange: number;
}

const snapshot = (r: ReentryRun): { frames: Snap[]; peaks: ReentryRun['peaks'] } => ({
  frames: r.history.map((f) => ({
    t: f.t,
    h: f.h,
    V: f.V,
    gamma: f.gamma,
    qdotS: f.qdotS,
    nLoad: f.nLoad,
    downrange: f.downrange,
  })),
  peaks: r.peaks,
});

const goldenPath = fileURLToPath(new URL('./reentry-reference.json', import.meta.url));

describe('reference capsule reentry (golden run)', () => {
  const current = snapshot(runReference());

  if (process.env.REGEN_GOLDEN) {
    writeFileSync(goldenPath, JSON.stringify(current, null, 2) + '\n');
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as typeof current;

  it('lands inside the vehicle limits (physics smoke test)', () => {
    expect(current.peaks.terminationReason).toBe('landed');
    expect(current.peaks.limitsExceeded).toBe(false);
    expect(current.peaks.qdotSMax).toBeLessThan(capsule.limits.maxHeatFluxWm2);
    expect(current.peaks.nMax).toBeLessThan(capsule.limits.maxGLoad);
    expect(current.peaks.downrangeM).toBeGreaterThan(1e6);
  });

  it('matches the checked-in reference history', () => {
    expect(current.frames.length).toBe(golden.frames.length);
    for (let i = 0; i < golden.frames.length; i++) {
      const c = current.frames[i];
      const g = golden.frames[i];
      expect(c.t).toBeCloseTo(g.t, 6);
      expect(c.h).toBeCloseTo(g.h, 3);
      expect(c.V).toBeCloseTo(g.V, 3);
      expect(c.gamma).toBeCloseTo(g.gamma, 8);
      expect(c.qdotS).toBeCloseTo(g.qdotS, 0);
      expect(c.nLoad).toBeCloseTo(g.nLoad, 6);
      expect(c.downrange).toBeCloseTo(g.downrange, 2);
    }
  });

  it('matches the checked-in reference peaks', () => {
    const c = current.peaks;
    const g = golden.peaks;
    expect(c.qdotSMax).toBeCloseTo(g.qdotSMax, 0);
    expect(c.tAtQdotSMax).toBeCloseTo(g.tAtQdotSMax, 6);
    expect(c.qTotalJm2).toBeCloseTo(g.qTotalJm2, 0);
    expect(c.nMax).toBeCloseTo(g.nMax, 6);
    expect(c.tAtNMax).toBeCloseTo(g.tAtNMax, 6);
    expect(c.downrangeM).toBeCloseTo(g.downrangeM, 2);
    expect(c.flightTimeS).toBeCloseTo(g.flightTimeS, 6);
    expect(c.speedAtTerminationMps).toBeCloseTo(g.speedAtTerminationMps, 3);
    expect(c.terminationReason).toBe(g.terminationReason);
  });

  it('is bit-for-bit deterministic across independent runs (README §1)', () => {
    const a = snapshot(runReference());
    const b = snapshot(runReference());
    expect(a).toEqual(b);
  });
});
