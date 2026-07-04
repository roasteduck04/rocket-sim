/**
 * Entry-corridor bisection validation (README §10.3.2; plan trap T3).
 *
 * The boundary search must converge to the same γ regardless of the starting
 * bracket, and the trajectory classifier must be monotone across the corridor
 * (skipped → landed → limits-exceeded as γ steepens) — interleaved
 * classifications would let the bisection "converge" to a different answer
 * from different brackets.
 *
 * Probed landscape for the generic capsule at V_entry = 7800 m/s due-East at
 * the equator (full lift-up, bank 0): skips through γ ≈ −2.1°, lands from
 * γ ≈ −2.5°, exceeds the 1 MW/m² heat-flux limit from γ ≈ −4°.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  GAMMA_TOL_RAD,
  classifyTrajectory,
  findEntryCorridor,
  findOvershootBoundary,
  findUndershootBoundary,
  loadReentryYaml,
  runReentry,
} from '@fds/reentry-sim';
import type { GammaBracket, ReentryConfig } from '@fds/reentry-sim';

const deg = (d: number): number => (d * Math.PI) / 180;

const capsule: ReentryConfig = loadReentryYaml(
  readFileSync(
    fileURLToPath(new URL('../../data/reentry-vehicles/generic-capsule.reentry.yaml', import.meta.url)),
    'utf8',
  ),
);

const V_ENTRY = 7800;
// Peaks-only runs: keep the recorded history sparse.
const SIM = { sampleEvery: 500 };
// Two independent bisections each converge within GAMMA_TOL_RAD of the true
// boundary, so results may differ pairwise by up to 2·tol (plus slack).
const AGREE_TOL = 2.5 * GAMMA_TOL_RAD;

describe('corridor bisection is bracket-independent (README §10.3.2)', () => {
  it('overshoot boundary agrees from three different brackets', () => {
    const brackets: GammaBracket[] = [
      [deg(-1.5), deg(-3.0)],
      [deg(-0.5), deg(-3.5)],
      [deg(-2.1), deg(-2.5)],
    ];
    const results = brackets.map((b) => findOvershootBoundary(capsule, V_ENTRY, b, SIM));
    for (const g of results) {
      expect(g).toBeLessThan(deg(-2.1));
      expect(g).toBeGreaterThan(deg(-2.5));
    }
    expect(Math.abs(results[0] - results[1])).toBeLessThan(AGREE_TOL);
    expect(Math.abs(results[0] - results[2])).toBeLessThan(AGREE_TOL);
    expect(Math.abs(results[1] - results[2])).toBeLessThan(AGREE_TOL);
  });

  it('undershoot boundary agrees from three different brackets', () => {
    const brackets: GammaBracket[] = [
      [deg(-3.0), deg(-5.0)],
      [deg(-2.5), deg(-6.0)],
      [deg(-3.5), deg(-4.5)],
    ];
    const results = brackets.map((b) => findUndershootBoundary(capsule, V_ENTRY, b, SIM));
    for (const g of results) {
      expect(g).toBeLessThan(deg(-3.5));
      expect(g).toBeGreaterThan(deg(-4.0));
    }
    expect(Math.abs(results[0] - results[1])).toBeLessThan(AGREE_TOL);
    expect(Math.abs(results[0] - results[2])).toBeLessThan(AGREE_TOL);
    expect(Math.abs(results[1] - results[2])).toBeLessThan(AGREE_TOL);
  });

  it('rejects a bracket that does not straddle the boundary (precheck)', () => {
    // Neither end of [−3°, −5°] skips.
    expect(() =>
      findOvershootBoundary(capsule, V_ENTRY, [deg(-3), deg(-5)], SIM),
    ).toThrow(/bracket/);
    // Neither end of [−0.5°, −2°] exceeds the limits (both skip gently).
    expect(() =>
      findUndershootBoundary(capsule, V_ENTRY, [deg(-0.5), deg(-2)], SIM),
    ).toThrow(/bracket/);
  });

  it('rejects an integrator tolerance looser than 10× the bisection tol (trap T3)', () => {
    expect(() =>
      findOvershootBoundary(capsule, V_ENTRY, [deg(-1.5), deg(-3)], { ...SIM, tol: 1e-4 }),
    ).toThrow(/tighter/);
  });
});

describe('classifier monotonicity across the corridor (plan trap T3)', () => {
  it('classification only ever steepens: skipped → landed → limits-exceeded', () => {
    const rank = { skipped: 0, landed: 1, 'limits-exceeded': 2 } as const;
    const n = 22;
    const gammas = Array.from(
      { length: n },
      (_, i) => deg(-0.3) + (deg(-5.0) - deg(-0.3)) * (i / (n - 1)),
    );
    const ranks = gammas.map((g) => rank[classifyTrajectory(runReentry(capsule, g, V_ENTRY, SIM))]);
    for (let i = 1; i < ranks.length; i++) {
      expect(
        ranks[i],
        `classification regressed at γ = ${(gammas[i] * 180) / Math.PI}°`,
      ).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
    // The sweep genuinely visits all three regimes.
    expect(new Set(ranks)).toEqual(new Set([0, 1, 2]));
  });
});

describe('corridor sweep (README §5.4 signature chart data)', () => {
  it('produces an open corridor with undershoot steeper than overshoot', () => {
    const curve = findEntryCorridor(capsule, [7700, 7900], 3, {
      overshootBracket: [deg(-0.5), deg(-3.5)],
      undershootBracket: [deg(-3.0), deg(-6.0)],
      sim: SIM,
    });
    expect(curve.vEntry).toEqual([7700, 7800, 7900]);
    for (let i = 0; i < curve.vEntry.length; i++) {
      const over = curve.gammaOvershoot[i];
      const under = curve.gammaUndershoot[i];
      // Both boundaries are descending entries inside their search brackets.
      expect(over).toBeLessThan(0);
      expect(under).toBeLessThan(over); // undershoot is the steeper limit
      // Corridor width is the engineering quantity (README §5.4): stays open.
      expect(over - under).toBeGreaterThan(deg(0.5));
    }
  });
});
