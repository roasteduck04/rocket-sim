/**
 * Tauber–Sutton radiative heating (README §5.2 optional term, Phase 7).
 *
 * Correlation (Earth): q̇_r = C·R_n^a·ρ^1.22·f(V) in W/cm², C = 4.736×10⁴,
 * a = 1.072×10⁶·V^(−1.88)·ρ^(−0.325) clamped to [0, 1], f(V) tabulated.
 *
 * Hand spot check at ρ = 10⁻⁴ kg/m³, V = 11 000 m/s (a table node), R_n = 1 m
 * (so R_n^a = 1 and the a-exponent drops out):
 *   ρ^1.22 = 10^(−4.88) = 1.31826×10⁻⁵;  f(11 000) = 151
 *   q̇_r = 4.736×10⁴ · 1.31826×10⁻⁵ · 151 = 94.27 W/cm² = 9.427×10⁵ W/m²
 */
import { describe, it, expect } from 'vitest';
import {
  B_TAUBER_SUTTON_EARTH,
  C_TAUBER_SUTTON_EARTH,
  F_V_EARTH,
  loadReentryYaml,
  radiativeVelocityFunction,
  runReentry,
  tauberSuttonEarth,
} from '@fds/reentry-sim';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const capsuleYaml = readFileSync(
  fileURLToPath(new URL('../../data/reentry-vehicles/generic-capsule.reentry.yaml', import.meta.url)),
  'utf8',
);

describe('radiative velocity function f(V) (Tauber–Sutton Earth table)', () => {
  it('is zero below the table (LEO-return speeds) and clamped above it', () => {
    expect(radiativeVelocityFunction(3500)).toBe(0); // NASA course example: q̇_r = 0
    expect(radiativeVelocityFunction(7800)).toBe(0);
    expect(radiativeVelocityFunction(8999)).toBe(0);
    const last = F_V_EARTH[F_V_EARTH.length - 1];
    expect(radiativeVelocityFunction(last[0])).toBe(last[1]);
    expect(radiativeVelocityFunction(20000)).toBe(last[1]);
  });

  it('reproduces the table nodes exactly and interpolates linearly between them', () => {
    for (const [v, f] of F_V_EARTH) expect(radiativeVelocityFunction(v)).toBe(f);
    // Midpoint of [10000, 10250]: (35 + 55)/2 = 45.
    expect(radiativeVelocityFunction(10125)).toBeCloseTo(45, 12);
  });

  it('is monotonically non-decreasing (near-exponential growth with V)', () => {
    let prev = -1;
    for (let v = 8000; v <= 17000; v += 100) {
      const f = radiativeVelocityFunction(v);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('tauberSuttonEarth q̇_r (Phase 7)', () => {
  it('matches the hand-calculated spot check (ρ=1e-4, V=11 km/s, Rn=1 m)', () => {
    const q = tauberSuttonEarth(1e-4, 11000, 1.0);
    const expected = C_TAUBER_SUTTON_EARTH * Math.pow(1e-4, B_TAUBER_SUTTON_EARTH) * 151 * 1e4;
    expect(q).toBeCloseTo(expected, 6);
    expect(q / 9.427e5).toBeCloseTo(1, 2);
  });

  it('scales with nose radius as R_n^a with the published a(V, ρ)', () => {
    const rho = 1e-4;
    const V = 11000;
    const a = 1.072e6 * Math.pow(V, -1.88) * Math.pow(rho, -0.325);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1); // inside validity band, no clamp active
    const ratio = tauberSuttonEarth(rho, V, 2.0) / tauberSuttonEarth(rho, V, 1.0);
    expect(ratio).toBeCloseTo(Math.pow(2, a), 8);
  });

  it('is zero for sub-orbital speeds and vacuum', () => {
    expect(tauberSuttonEarth(1e-4, 7800, 1.0)).toBe(0);
    expect(tauberSuttonEarth(0, 12000, 1.0)).toBe(0);
  });
});

describe('reentry radiative toggle (Phase 7)', () => {
  const cfg = loadReentryYaml(capsuleYaml);

  it('LEO-class entry (7.8 km/s): radiative on changes nothing (below the table)', () => {
    const off = runReentry(cfg, (-3 * Math.PI) / 180, 7800);
    const on = runReentry(cfg, (-3 * Math.PI) / 180, 7800, { radiative: true });
    expect(on.peaks.qdotRMax).toBe(0);
    expect(on.peaks.qRadTotalJm2).toBe(0);
    expect(on.peaks.qdotSMax).toBe(off.peaks.qdotSMax);
    expect(on.peaks.qdotTotalMax).toBe(off.peaks.qdotSMax);
    expect(on.peaks.limitsExceeded).toBe(off.peaks.limitsExceeded);
  });

  it('super-orbital entry (11 km/s): radiative heating appears and adds to the total', () => {
    const gamma = (-6.5 * Math.PI) / 180;
    const off = runReentry(cfg, gamma, 11000);
    const on = runReentry(cfg, gamma, 11000, { radiative: true });
    expect(on.peaks.qdotRMax).toBeGreaterThan(0);
    expect(on.peaks.qRadTotalJm2).toBeGreaterThan(0);
    expect(on.peaks.qdotTotalMax).toBeGreaterThan(on.peaks.qdotSMax);
    // The trajectory itself is identical (heating is diagnostic, not a force):
    expect(on.peaks.flightTimeS).toBe(off.peaks.flightTimeS);
    expect(on.peaks.nMax).toBe(off.peaks.nMax);
    // History carries the per-frame radiative flux; its max is the peak.
    const histMax = Math.max(...on.history.map((f) => f.qdotR));
    expect(histMax).toBeCloseTo(on.peaks.qdotRMax, 10);
    // With radiative off the same fields are inert.
    expect(off.peaks.qdotRMax).toBe(0);
    expect(off.history.every((f) => f.qdotR === 0)).toBe(true);
  });
});
