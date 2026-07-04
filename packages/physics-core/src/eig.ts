/**
 * Eigenvalues of a real 4×4 matrix — needed by the aircraft modal analysis
 * (Phase 1), but built and unit-tested here in the core.
 *
 * Method: Faddeev–LeVerrier to form the characteristic polynomial exactly
 * (rational, no rounding beyond floating point), then Durand–Kerner to find all
 * four (possibly complex) roots simultaneously. Both are small and deterministic
 * — no randomness, no external numerics dependency (README §7).
 */

import {
  type Complex,
  complex,
  cadd,
  csub,
  cmul,
  cscale,
  cdiv,
  cabs,
} from './complex.js';

const N = 4;

type Mat4 = number[][];

const mat4zeros = (): Mat4 => [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

const mat4mul = (a: Mat4, b: Mat4): Mat4 => {
  const out = mat4zeros();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let s = 0;
      for (let k = 0; k < N; k++) s += a[i][k] * b[k][j];
      out[i][j] = s;
    }
  }
  return out;
};

const mat4trace = (a: Mat4): number => a[0][0] + a[1][1] + a[2][2] + a[3][3];

/** Returns m + s·I. */
const mat4addScaledIdentity = (m: Mat4, s: number): Mat4 => {
  const out = m.map((row) => row.slice());
  for (let i = 0; i < N; i++) out[i][i] += s;
  return out;
};

/**
 * Characteristic-polynomial coefficients in ascending order
 * `[c0, c1, c2, c3, c4]` for p(λ) = c4·λ⁴ + … + c0, with c4 = 1 (monic).
 */
export const charPoly4 = (A: Mat4): number[] => {
  const coeffs = new Array<number>(N + 1);
  coeffs[N] = 1;
  let M = mat4zeros(); // M_0
  for (let k = 1; k <= N; k++) {
    const cPrev = coeffs[N - k + 1]; // c_{n-k+1}; for k=1 this is c_n = 1
    M = mat4addScaledIdentity(mat4mul(A, M), cPrev); // M_k = A·M_{k-1} + c_{n-k+1}·I
    coeffs[N - k] = (-1 / k) * mat4trace(mat4mul(A, M));
  }
  return coeffs;
};

/** Evaluate a polynomial (ascending coefficients) at a complex point via Horner. */
const polyEval = (coeffsAsc: number[], z: Complex): Complex => {
  let result = complex(coeffsAsc[coeffsAsc.length - 1]);
  for (let i = coeffsAsc.length - 2; i >= 0; i--) {
    result = cadd(cmul(result, z), complex(coeffsAsc[i]));
  }
  return result;
};

const durandKerner = (
  coeffsAsc: number[],
  tol = 1e-14,
  maxIter = 1000,
): Complex[] => {
  const deg = coeffsAsc.length - 1;
  const lead = coeffsAsc[deg];

  // Cauchy-style radius so the initial guesses bracket the root annulus.
  let radius = 0;
  for (let i = 0; i < deg; i++) {
    radius = Math.max(radius, Math.abs(coeffsAsc[i] / lead));
  }
  radius = 1 + radius;

  // Deterministic non-real seed spiral, scaled by the radius.
  const seed = complex(0.4, 0.9);
  const roots: Complex[] = [];
  let acc = complex(1, 0);
  for (let k = 0; k < deg; k++) {
    roots.push(cscale(acc, radius));
    acc = cmul(acc, seed);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < deg; i++) {
      const zi = roots[i];
      let denom = complex(1, 0);
      for (let j = 0; j < deg; j++) {
        if (j !== i) denom = cmul(denom, csub(zi, roots[j]));
      }
      if (cabs(denom) < 1e-300) continue; // coincident guesses — skip this pass
      const delta = cdiv(polyEval(coeffsAsc, zi), denom);
      roots[i] = csub(zi, delta);
      maxDelta = Math.max(maxDelta, cabs(delta));
    }
    if (maxDelta < tol) break;
  }
  return roots;
};

/** Eigenvalues of a real 4×4 matrix, returned as four complex numbers. */
export const eig4x4 = (A: Mat4): Complex[] => durandKerner(charPoly4(A));
