/**
 * Golden-run regression + determinism for the reference landing burn
 * (README §1 "deterministic, testable physics"; plan Phase 4 golden run).
 *
 * The reference booster config (data/reference-tvc-booster.rocket.yaml,
 * including its `control.descent` block — this exercises the loader's Phase-4
 * parsing end-to-end) flies a powered descent from 2 km with a lateral offset,
 * and a compact telemetry snapshot is compared against the checked-in
 * `landing-reference.json`. Re-generate after an intentional physics change
 * with `REGEN_GOLDEN=1 npx vitest run tests/golden-runs/rocket-landing.test.ts`.
 *
 * The aero table is swapped for a zero-coefficient one: a tail-first descent
 * flies at α ≈ 180°, outside the shipped ascent-domain table's validity (see
 * docs/equations.md Phase 4 "modeling limitations").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadRocketYaml, runLandingSim } from '@fds/rocket-sim';
import type { LandingScenario, RocketConfig, RunResult } from '@fds/rocket-sim';

const dataUrl = (p: string): string =>
  fileURLToPath(new URL(`../../data/${p}`, import.meta.url));

const ZERO_AERO_CSV =
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0';

const cfg: RocketConfig = loadRocketYaml(
  readFileSync(dataUrl('reference-tvc-booster.rocket.yaml'), 'utf8'),
  {
    thrustCurveCsv: readFileSync(dataUrl('thrust-curves/booster_main.csv'), 'utf8'),
    aeroTableCsv: ZERO_AERO_CSV,
  },
);

const scenario: LandingScenario = {
  altitudeM: 2000,
  descentRateMps: 120,
  northM: -60,
  vEastMps: 8,
  propellantKg: 800,
};

const runLanding = (): RunResult => runLandingSim(cfg, scenario, { maxTime: 120, sampleEvery: 100 });

interface Snap {
  t: number;
  altitude: number;
  speed: number;
  mass: number;
  theta: number;
  throttle: number;
  deltaP: number;
  north: number;
  east: number;
}

const snapshot = (r: RunResult): { frames: Snap[]; summary: RunResult['summary'] } => ({
  frames: r.telemetry.map((f) => ({
    t: f.t,
    altitude: f.altitude,
    speed: f.speed,
    mass: f.mass,
    theta: f.euler.theta,
    throttle: f.throttle,
    deltaP: f.deltaP,
    north: f.r.x,
    east: f.r.y,
  })),
  summary: r.summary,
});

const goldenPath = fileURLToPath(new URL('./landing-reference.json', import.meta.url));

describe('reference powered-descent landing burn (golden run)', () => {
  const current = snapshot(runLanding());

  if (process.env.REGEN_GOLDEN) {
    writeFileSync(goldenPath, JSON.stringify(current, null, 2) + '\n');
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as typeof current;

  it('lands softly on target (physics smoke test)', () => {
    const landing = current.summary.landing!;
    expect(landing.touchedDown).toBe(true);
    expect(landing.ignitionTime).toBeGreaterThan(0);
    expect(landing.touchdownVz).toBeGreaterThan(0);
    expect(landing.touchdownVz).toBeLessThan(2.0); // §8.1 touchdown_vz_max_mps
    expect(landing.missDistance).toBeLessThan(5);
  });

  it('matches the checked-in reference telemetry', () => {
    expect(current.frames.length).toBe(golden.frames.length);
    for (let i = 0; i < golden.frames.length; i++) {
      const c = current.frames[i];
      const g = golden.frames[i];
      expect(c.t).toBeCloseTo(g.t, 6);
      expect(c.altitude).toBeCloseTo(g.altitude, 3);
      expect(c.speed).toBeCloseTo(g.speed, 3);
      expect(c.mass).toBeCloseTo(g.mass, 3);
      expect(c.theta).toBeCloseTo(g.theta, 6);
      expect(c.throttle).toBeCloseTo(g.throttle, 6);
      expect(c.deltaP).toBeCloseTo(g.deltaP, 8);
      expect(c.north).toBeCloseTo(g.north, 3);
      expect(c.east).toBeCloseTo(g.east, 3);
    }
  });

  it('matches reference landing metrics', () => {
    const c = current.summary.landing!;
    const g = golden.summary.landing!;
    expect(c.ignitionTime).toBeCloseTo(g.ignitionTime!, 6);
    expect(c.touchdownVz).toBeCloseTo(g.touchdownVz, 6);
    expect(c.touchdownLateralSpeed).toBeCloseTo(g.touchdownLateralSpeed, 6);
    expect(c.missDistance).toBeCloseTo(g.missDistance, 4);
    expect(c.touchdownG).toBeCloseTo(g.touchdownG, 6);
    expect(c.propellantUsedKg).toBeCloseTo(g.propellantUsedKg, 3);
    expect(current.summary.flightTime).toBeCloseTo(golden.summary.flightTime, 6);
  });

  it('is bit-for-bit deterministic across independent runs (README §1)', () => {
    const a = snapshot(runLanding());
    const b = snapshot(runLanding());
    expect(a).toEqual(b);
  });
});
