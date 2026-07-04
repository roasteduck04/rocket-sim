import { describe, it, expect } from 'vitest';
import { eig4x4, charPoly4, type Complex } from '@fds/physics-core';

// Order-independent set comparison: eigenvalues have no canonical order, and
// sorting complex-conjugate pairs by a floating-point `re` ≈ 0 is unstable.
// Instead, greedily match each expected value to the nearest computed one.
const expectEigClose = (
  got: Complex[],
  expected: Array<{ re: number; im: number }>,
  tol: number,
): void => {
  expect(got.length).toBe(expected.length);
  const remaining = got.map((c) => ({ re: c.re, im: c.im }));
  for (const e of expected) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(remaining[i].re - e.re, remaining[i].im - e.im);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    expect(bestDist, `nearest match to ${e.re}${e.im >= 0 ? '+' : ''}${e.im}i`).toBeLessThan(tol);
    remaining.splice(best, 1);
  }
};

describe('eig4x4 (Faddeev–LeVerrier + Durand–Kerner)', () => {
  it('characteristic polynomial of a diagonal matrix', () => {
    // (λ+1)(λ+2)(λ+3)(λ+4) = λ⁴ + 10λ³ + 35λ² + 50λ + 24
    const A = [
      [-1, 0, 0, 0],
      [0, -2, 0, 0],
      [0, 0, -3, 0],
      [0, 0, 0, -4],
    ];
    const c = charPoly4(A); // ascending [c0..c4]
    const expected = [24, 50, 35, 10, 1];
    for (let i = 0; i < 5; i++) expect(c[i]).toBeCloseTo(expected[i], 8);
  });

  it('real distinct eigenvalues (diagonal)', () => {
    const A = [
      [-1, 0, 0, 0],
      [0, -2, 0, 0],
      [0, 0, -3, 0],
      [0, 0, 0, -4],
    ];
    expectEigClose(eig4x4(A), [
      { re: -1, im: 0 },
      { re: -2, im: 0 },
      { re: -3, im: 0 },
      { re: -4, im: 0 },
    ], 1e-6);
  });

  it('a complex-conjugate pair plus two real roots', () => {
    // block [[0,-4],[1,0]] → ±2i ; plus −1, −5.
    const A = [
      [0, -4, 0, 0],
      [1, 0, 0, 0],
      [0, 0, -1, 0],
      [0, 0, 0, -5],
    ];
    expectEigClose(eig4x4(A), [
      { re: 0, im: 2 },
      { re: 0, im: -2 },
      { re: -1, im: 0 },
      { re: -5, im: 0 },
    ], 1e-6);
  });

  it('repeated eigenvalues (defective 2×2 Jordan blocks)', () => {
    const A = [
      [2, 1, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 3, 1],
      [0, 0, 0, 3],
    ];
    // Durand–Kerner converges linearly on repeated roots — looser tolerance.
    expectEigClose(eig4x4(A), [
      { re: 2, im: 0 },
      { re: 2, im: 0 },
      { re: 3, im: 0 },
      { re: 3, im: 0 },
    ], 5e-3);
  });
});
