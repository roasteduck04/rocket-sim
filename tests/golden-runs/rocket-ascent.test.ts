/**
 * Golden-run regression + determinism for the open-loop reference ascent
 * (README §1 "deterministic, testable physics"; plan Phase 2 golden run).
 *
 * The reference booster (data/reference-tvc-booster.rocket.yaml) is flown open-
 * loop for 20 s and a compact telemetry snapshot is compared against the checked-
 * in `ascent-reference.json`. Re-generate after an intentional physics change
 * with `REGEN_GOLDEN=1 npx vitest run tests/golden-runs/rocket-ascent.test.ts`.
 *
 * Also asserts bit-identical telemetry across two independent runs (determinism).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadRocketYaml, runRocketSim, openLoopAscent } from '@fds/rocket-sim';
import type { RocketConfig, RunResult } from '@fds/rocket-sim';

const dataUrl = (p: string): string =>
  fileURLToPath(new URL(`../../data/${p}`, import.meta.url));

const cfg: RocketConfig = loadRocketYaml(
  readFileSync(dataUrl('reference-tvc-booster.rocket.yaml'), 'utf8'),
  {
    thrustCurveCsv: readFileSync(dataUrl('thrust-curves/booster_main.csv'), 'utf8'),
    aeroTableCsv: readFileSync(dataUrl('aero-tables/booster_aero.csv'), 'utf8'),
  },
);

const runAscent = (): RunResult =>
  runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 11, sampleEvery: 100 });

interface Snap {
  t: number;
  altitude: number;
  speed: number;
  mach: number;
  mass: number;
  alpha: number;
  staticMargin: number;
  theta: number;
}

const snapshot = (r: RunResult): { frames: Snap[]; summary: RunResult['summary'] } => ({
  frames: r.telemetry.map((f) => ({
    t: f.t,
    altitude: f.altitude,
    speed: f.speed,
    mach: f.mach,
    mass: f.mass,
    alpha: f.alpha,
    staticMargin: f.staticMargin,
    theta: f.euler.theta,
  })),
  summary: r.summary,
});

const goldenPath = fileURLToPath(new URL('./ascent-reference.json', import.meta.url));

describe('reference open-loop ascent (golden run)', () => {
  const current = snapshot(runAscent());

  if (process.env.REGEN_GOLDEN) {
    writeFileSync(goldenPath, JSON.stringify(current, null, 2) + '\n');
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as typeof current;

  it('has a sane liftoff + early ascent (physics smoke test)', () => {
    const f = current.frames;
    expect(f.length).toBeGreaterThan(5);
    expect(f[0].altitude).toBeCloseTo(0, 6); // starts on the pad
    expect(f[f.length - 1].altitude).toBeGreaterThan(100); // climbing after 20 s
    expect(current.summary.maxAxialG).toBeGreaterThan(1); // thrust exceeds weight
    expect(current.summary.apogeeAltitude).toBeGreaterThanOrEqual(f[f.length - 1].altitude);
  });

  it('matches the checked-in reference telemetry', () => {
    expect(current.frames.length).toBe(golden.frames.length);
    for (let i = 0; i < golden.frames.length; i++) {
      const c = current.frames[i];
      const g = golden.frames[i];
      expect(c.t).toBeCloseTo(g.t, 6);
      expect(c.altitude).toBeCloseTo(g.altitude, 3);
      expect(c.speed).toBeCloseTo(g.speed, 3);
      expect(c.mach).toBeCloseTo(g.mach, 5);
      expect(c.mass).toBeCloseTo(g.mass, 3);
      expect(c.alpha).toBeCloseTo(g.alpha, 6);
      expect(c.staticMargin).toBeCloseTo(g.staticMargin, 5);
      expect(c.theta).toBeCloseTo(g.theta, 6);
    }
  });

  it('matches reference summary metrics', () => {
    expect(current.summary.apogeeAltitude).toBeCloseTo(golden.summary.apogeeAltitude, 2);
    expect(current.summary.maxMach).toBeCloseTo(golden.summary.maxMach, 4);
    expect(current.summary.maxQbar).toBeCloseTo(golden.summary.maxQbar, 1);
  });

  it('is bit-for-bit deterministic across independent runs (README §1)', () => {
    const a = snapshot(runAscent());
    const b = snapshot(runAscent());
    expect(a).toEqual(b);
  });
});
