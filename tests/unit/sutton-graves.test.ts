/**
 * Sutton–Graves heating spot check (README §10.3.3) and heat-load accumulator.
 *
 * Hand calculation: q̇ₛ = k_Q·√(ρ/R_n)·V³ with k_Q = 1.7415×10⁻⁴,
 * ρ = 1×10⁻⁴ kg/m³, V = 7000 m/s, R_n = 1 m:
 *   √(1e-4/1) = 1e-2;  7000³ = 3.43×10¹¹
 *   q̇ₛ = 1.7415e-4 · 1e-2 · 3.43e11 = 5.973345×10⁵ W/m²  (≈ 5.97×10⁵)
 */
import { describe, it, expect } from 'vitest';
import { suttonGraves, HeatLoadAccumulator } from '@fds/reentry-sim';

describe('Sutton–Graves stagnation-point heat flux (README §5.2, §10.3.3)', () => {
  it('matches the §10.3.3 hand-calculated round-number case', () => {
    const qdot = suttonGraves(1e-4, 7000, 1.0);
    expect(qdot).toBeCloseTo(5.973345e5, 0);
    // README quotes ≈ 5.97×10⁵ W/m².
    expect(qdot / 5.97e5).toBeCloseTo(1, 2);
  });

  it('scales as √ρ, 1/√Rn, and V³', () => {
    const base = suttonGraves(1e-4, 7000, 1.0);
    expect(suttonGraves(4e-4, 7000, 1.0)).toBeCloseTo(2 * base, 6);
    expect(suttonGraves(1e-4, 7000, 4.0)).toBeCloseTo(base / 2, 6);
    expect(suttonGraves(1e-4, 14000, 1.0)).toBeCloseTo(8 * base, 4);
  });

  it('is zero in vacuum and at rest', () => {
    expect(suttonGraves(0, 7000, 1.0)).toBe(0);
    expect(suttonGraves(1e-4, 0, 1.0)).toBe(0);
  });
});

describe('heat-load accumulator (README §5.2 Q_total)', () => {
  it('trapezoid-integrates q̇ₛ(t) = t exactly, including uneven steps', () => {
    const acc = new HeatLoadAccumulator();
    // ∫₀² t dt = 2, sampled at uneven spacing (adaptive-step shape).
    for (const t of [0, 0.1, 0.35, 0.8, 1.5, 2.0]) acc.add(t, t);
    expect(acc.totalJm2).toBeCloseTo(2, 12);
  });

  it('starts at zero and ignores a lone first sample', () => {
    const acc = new HeatLoadAccumulator();
    expect(acc.totalJm2).toBe(0);
    acc.add(5, 1e6);
    expect(acc.totalJm2).toBe(0);
  });
});
