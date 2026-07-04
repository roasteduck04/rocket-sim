/**
 * Ballistic-entry validation vs Allen–Eggers theory (README §10.3.1).
 *
 * A pure ballistic (L = 0) steep entry must show peak deceleration and peak
 * heat flux occurring near-simultaneously. Allen–Eggers also gives two
 * closed-form, scale-height-independent checkpoints for a straight-line steep
 * ballistic entry in an exponential atmosphere:
 *
 *   V at peak deceleration = V_E · e^(−1/2) ≈ 0.6065 · V_E
 *   V at peak heat flux    = V_E · e^(−1/6) ≈ 0.8465 · V_E
 *
 * (peak q̇ₛ maximizes ρV⁶ ∝ ρ·(V³)², peak decel maximizes ρV²; both under
 * V = V_E·exp(−ρH/(2β sinγ)) — Anderson, Hypersonic and High-Temperature Gas
 * Dynamics). The US76 atmosphere is only piecewise-exponential and gravity is
 * neglected in the theory, so the gates are a few percent wide.
 */
import { readFileSync } from 'node:fs';
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
// Pure ballistic vehicle: same capsule with the lift zeroed (README §5.1:
// "ballistic vehicles simply set L ≈ 0").
const ballistic: ReentryConfig = { ...capsule, clOverCd: 0 };

const V_ENTRY = 7500;
const GAMMA_ENTRY = deg(-40);

const frameAt = (run: ReentryRun, t: number) => {
  const f = run.history.find((fr) => fr.t === t);
  expect(f, `no recorded frame at t = ${t}`).toBeDefined();
  return f!;
};

describe('steep ballistic entry vs Allen–Eggers (README §10.3.1)', () => {
  // Record every accepted step so the peak times map to recorded frames.
  const run = runReentry(ballistic, GAMMA_ENTRY, V_ENTRY, { sampleEvery: 1 });

  it('flies to the ground without skipping', () => {
    expect(run.peaks.terminationReason).toBe('landed');
    expect(run.history[run.history.length - 1].h).toBeCloseTo(0, 3);
  });

  it('peak g-load and peak heat flux occur near-simultaneously', () => {
    const { tAtNMax, tAtQdotSMax } = run.peaks;
    // Heating peaks first (higher V weighting), deceleration shortly after;
    // both sit inside the brief hypersonic deceleration pulse, far from the
    // slow subsonic tail of the fall.
    expect(tAtQdotSMax).toBeLessThan(tAtNMax);
    expect(tAtNMax - tAtQdotSMax).toBeLessThan(5);
    expect(tAtNMax - tAtQdotSMax).toBeLessThan(0.15 * tAtNMax);
  });

  it('velocity at peak deceleration matches V_E·e^(−1/2)', () => {
    const vRatio = frameAt(run, run.peaks.tAtNMax).V / V_ENTRY;
    expect(Math.abs(vRatio - Math.exp(-0.5))).toBeLessThan(0.03);
  });

  it('velocity at peak heat flux matches V_E·e^(−1/6)', () => {
    const vRatio = frameAt(run, run.peaks.tAtQdotSMax).V / V_ENTRY;
    expect(Math.abs(vRatio - Math.exp(-1 / 6))).toBeLessThan(0.03);
  });

  it('reports physically sensible peaks for a 40° ballistic entry', () => {
    // A steep ballistic entry is brutal: far beyond the crewed-capsule limits.
    expect(run.peaks.nMax).toBeGreaterThan(50);
    expect(run.peaks.qdotSMax).toBeGreaterThan(capsule.limits.maxHeatFluxWm2);
    expect(run.peaks.limitsExceeded).toBe(true);
    expect(run.peaks.qTotalJm2).toBeGreaterThan(0);
    // Peak deceleration happens well inside the sensible atmosphere.
    const hAtPeak = frameAt(run, run.peaks.tAtNMax).h;
    expect(hAtPeak).toBeGreaterThan(10_000);
    expect(hAtPeak).toBeLessThan(60_000);
  });
});
