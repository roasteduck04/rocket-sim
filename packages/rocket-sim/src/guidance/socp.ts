/**
 * Minimal dense second-order-cone-program solver (Phase 7, supporting
 * `pdg.ts`). Self-contained on purpose: README §7 keeps the suite free of
 * external numerics dependencies, so the convex PDG ships its own solver.
 *
 * Problem form (SCS/conic standard):
 *
 *   minimize    cᵀx
 *   subject to  A·x + s = b,   s ∈ K
 *
 * where K is a product cone, ordered by rows: {0}^eq × R₊^nonneg × ∏ SOC(dᵢ)
 * (SOC(d): s₀ ≥ ‖s₁..d₋₁‖, scalar first).
 *
 * Method: ADMM with the EQUALITY rows enforced exactly inside the x-update —
 * the x-step is an equality-constrained least-squares problem solved through
 * a KKT system factored once (partial-pivot LU); only the inequality/SOC
 * blocks go through the operator splitting:
 *
 *   x ← argmin_{A_eq·x = b_eq}  cᵀx + (ρ/2)‖A_c·x + s − b_c + y‖²
 *   s ← Π_K(b_c − Âx − y)           (over-relaxed Âx, α = 1.6)
 *   y ← y + Âx + s − b_c
 *
 * Two standard accelerations, both load-bearing on the PDG problem:
 *  - Cone rows are EQUILIBRATED block-wise (each nonneg row, and each SOC
 *    block by a common factor, to unit ∞-norm) — the raw PDG rows span ~3
 *    orders of magnitude and unscaled ADMM crawls.
 *  - Residual-balancing adaptive ρ. The KKT factor is ρ-independent (ρ only
 *    scales c and the tiny regularization), so re-tuning ρ is free.
 *
 * Convergence is linear — fine for guidance-grade tolerances on the O(1)
 * nondimensionalized data `pdg.ts` feeds in.
 */

/** Cone layout by consecutive row blocks, in fixed order. */
export interface ConeSpec {
  /** Leading rows pinned to the zero cone (equality constraints). */
  eq: number;
  /** Next rows in the nonnegative orthant (inequalities). */
  nonneg: number;
  /** Then one second-order cone per entry, of the given dimension (≥ 2). */
  soc: number[];
}

export interface SocpProblem {
  /** Objective row vector c (length n). */
  c: Float64Array;
  /** Dense constraint matrix A (m×n, array of row vectors). */
  A: Float64Array[];
  /** Right-hand side b (length m). */
  b: Float64Array;
  cones: ConeSpec;
}

export interface SocpOptions {
  maxIterations?: number;
  /** Primal/dual residual tolerance (∞-norm, on the equilibrated data). */
  tolerance?: number;
  /** Initial ADMM penalty ρ. */
  rho?: number;
}

export interface SocpSolution {
  x: Float64Array;
  status: 'converged' | 'max-iterations';
  iterations: number;
  primalResidual: number;
  dualResidual: number;
}

/** Project a single second-order-cone block [t, z…] in place. */
const projectSoc = (s: Float64Array, offset: number, dim: number): void => {
  const t = s[offset];
  let zz = 0;
  for (let i = 1; i < dim; i++) zz += s[offset + i] * s[offset + i];
  const zn = Math.sqrt(zz);
  if (zn <= t) return; // inside the cone
  if (zn <= -t) {
    for (let i = 0; i < dim; i++) s[offset + i] = 0; // polar cone → origin
    return;
  }
  const tau = (t + zn) / 2;
  s[offset] = tau;
  const scale = tau / zn;
  for (let i = 1; i < dim; i++) s[offset + i] *= scale;
};

/** Dense LU with partial pivoting; returns {LU, piv} for `luSolve`. */
const luFactor = (M: Float64Array[], n: number): { LU: Float64Array[]; piv: Int32Array } => {
  const LU = M.map((r) => Float64Array.from(r));
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(LU[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(LU[i][k]);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (best === 0) throw new Error(`socp: singular KKT system at column ${k}`);
    if (p !== k) {
      const tmp = LU[k];
      LU[k] = LU[p];
      LU[p] = tmp;
      const tp = piv[k];
      piv[k] = piv[p];
      piv[p] = tp;
    }
    const pivot = LU[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = LU[i][k] / pivot;
      LU[i][k] = f;
      if (f === 0) continue;
      const Rk = LU[k];
      const Ri = LU[i];
      for (let j = k + 1; j < n; j++) Ri[j] -= f * Rk[j];
    }
  }
  return { LU, piv };
};

const luSolve = (
  f: { LU: Float64Array[]; piv: Int32Array },
  rhs: Float64Array,
): Float64Array<ArrayBuffer> => {
  const n = rhs.length;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = rhs[f.piv[i]];
  for (let i = 0; i < n; i++) {
    const Ri = f.LU[i];
    let v = x[i];
    for (let k = 0; k < i; k++) v -= Ri[k] * x[k];
    x[i] = v;
  }
  for (let i = n - 1; i >= 0; i--) {
    const Ri = f.LU[i];
    let v = x[i];
    for (let k = i + 1; k < n; k++) v -= Ri[k] * x[k];
    x[i] = v / Ri[i];
  }
  return x;
};

// Default tolerance is guidance-grade: the KKT regularization (EPS_REG) sets
// a residual floor around 1e-6..1e-4 on equilibrated data (grows with cone
// count), while the actual trajectory quality at that point is far tighter
// (terminal errors ~1e-6 in problem units — micrometres for the PDG).
// Tighten explicitly for small analytic problems.
const DEFAULTS = { maxIterations: 20000, tolerance: 1e-4, rho: 1.0 };
const ALPHA = 1.6; // over-relaxation
const EPS_REG = 1e-9;

/** Solve the SOCP. See the module header for the problem form and method. */
export const solveSocp = (p: SocpProblem, opts: SocpOptions = {}): SocpSolution => {
  const maxIter = opts.maxIterations ?? DEFAULTS.maxIterations;
  const tol = opts.tolerance ?? DEFAULTS.tolerance;
  let rho = opts.rho ?? DEFAULTS.rho;

  const mAll = p.A.length;
  const n = p.c.length;
  const coneRows = p.cones.eq + p.cones.nonneg + p.cones.soc.reduce((a, d) => a + d, 0);
  if (coneRows !== mAll || p.b.length !== mAll) {
    throw new Error(`socp: cone rows (${coneRows}) / b (${p.b.length}) must match A rows (${mAll})`);
  }

  // --- Split: equality rows (exact, via KKT) vs cone rows (ADMM). ---
  const nEq = p.cones.eq;
  const Aeq = p.A.slice(0, nEq);
  const beq = p.b.slice(0, nEq);
  const m = mAll - nEq; // cone rows
  const Ac: Float64Array[] = [];
  const bc = new Float64Array(m);

  // Block-wise equilibration of the cone rows to unit ∞-norm.
  {
    const rowNorm = (r: Float64Array): number => {
      let acc = 0;
      for (let j = 0; j < n; j++) acc = Math.max(acc, Math.abs(r[j]));
      return acc;
    };
    let src = nEq;
    let dst = 0;
    for (let i = 0; i < p.cones.nonneg; i++, src++, dst++) {
      const d = 1 / Math.max(1e-12, rowNorm(p.A[src]));
      const r = Float64Array.from(p.A[src]);
      for (let j = 0; j < n; j++) r[j] *= d;
      Ac.push(r);
      bc[dst] = p.b[src] * d;
    }
    for (const dim of p.cones.soc) {
      let blockNorm = 0;
      for (let i = 0; i < dim; i++) blockNorm = Math.max(blockNorm, rowNorm(p.A[src + i]));
      const d = 1 / Math.max(1e-12, blockNorm);
      for (let i = 0; i < dim; i++, src++, dst++) {
        const r = Float64Array.from(p.A[src]);
        for (let j = 0; j < n; j++) r[j] *= d;
        Ac.push(r);
        bc[dst] = p.b[src] * d;
      }
    }
  }

  // --- KKT system: [AcᵀAc + εI, Aeqᵀ; Aeq, −εI], factored once. ---
  const dim = n + nEq;
  const K: Float64Array[] = [];
  for (let i = 0; i < dim; i++) K.push(new Float64Array(dim));
  for (let r = 0; r < m; r++) {
    const row = Ac[r];
    for (let i = 0; i < n; i++) {
      const ri = row[i];
      if (ri === 0) continue;
      const Ki = K[i];
      for (let j = 0; j < n; j++) Ki[j] += ri * row[j];
    }
  }
  for (let i = 0; i < n; i++) K[i][i] += EPS_REG;
  for (let e = 0; e < nEq; e++) {
    for (let j = 0; j < n; j++) {
      K[j][n + e] = Aeq[e][j];
      K[n + e][j] = Aeq[e][j];
    }
    K[n + e][n + e] = -EPS_REG;
  }
  const kkt = luFactor(K, dim);

  const matVec = (x: Float64Array): Float64Array => {
    const out = new Float64Array(m);
    for (let r = 0; r < m; r++) {
      const row = Ac[r];
      let acc = 0;
      for (let j = 0; j < n; j++) acc += row[j] * x[j];
      out[r] = acc;
    }
    return out;
  };
  const matTVec = (v: Float64Array): Float64Array => {
    const out = new Float64Array(n);
    for (let r = 0; r < m; r++) {
      const vr = v[r];
      if (vr === 0) continue;
      const row = Ac[r];
      for (let j = 0; j < n; j++) out[j] += row[j] * vr;
    }
    return out;
  };
  const infNorm = (v: Float64Array): number => {
    let acc = 0;
    for (let i = 0; i < v.length; i++) acc = Math.max(acc, Math.abs(v[i]));
    return acc;
  };

  /** Π onto the cone part of K (nonneg + SOCs) in place. */
  const projectConePart = (s: Float64Array): void => {
    for (let i = 0; i < p.cones.nonneg; i++) s[i] = Math.max(0, s[i]);
    let off = p.cones.nonneg;
    for (const d of p.cones.soc) {
      projectSoc(s, off, d);
      off += d;
    }
  };

  let x = new Float64Array(n);
  const s = new Float64Array(m);
  const y = new Float64Array(m);
  const sPrev = new Float64Array(m);
  const rhs = new Float64Array(dim);
  let primalResidual = Infinity;
  let dualResidual = Infinity;

  for (let iter = 1; iter <= maxIter; iter++) {
    // x-step: KKT solve of the equality-constrained least squares.
    const rv = new Float64Array(m);
    for (let r = 0; r < m; r++) rv[r] = bc[r] - s[r] - y[r];
    const g = matTVec(rv);
    for (let j = 0; j < n; j++) rhs[j] = g[j] - p.c[j] / rho;
    for (let e = 0; e < nEq; e++) rhs[n + e] = beq[e];
    const xv = luSolve(kkt, rhs);
    x = xv.subarray(0, n) as Float64Array<ArrayBuffer>;

    // s-step with over-relaxation on Ax.
    const Ax = matVec(x);
    sPrev.set(s);
    for (let r = 0; r < m; r++) {
      const axHat = ALPHA * Ax[r] + (1 - ALPHA) * (bc[r] - sPrev[r]);
      s[r] = bc[r] - axHat - y[r];
      Ax[r] = axHat; // reuse the buffer for the dual update below
    }
    projectConePart(s);

    for (let r = 0; r < m; r++) y[r] += Ax[r] + s[r] - bc[r];

    if (iter % 25 === 0 || iter === maxIter) {
      const rp = new Float64Array(m);
      const trueAx = matVec(x);
      for (let r = 0; r < m; r++) rp[r] = trueAx[r] + s[r] - bc[r];
      const ds = new Float64Array(m);
      for (let r = 0; r < m; r++) ds[r] = s[r] - sPrev[r];
      primalResidual = infNorm(rp);
      dualResidual = rho * infNorm(matTVec(ds));
      if (primalResidual < tol && dualResidual < tol) {
        return {
          x: Float64Array.from(x),
          status: 'converged',
          iterations: iter,
          primalResidual,
          dualResidual,
        };
      }
      // Residual balancing; the KKT factor does not depend on ρ, and the
      // scaled dual is rescaled so λ = ρ·y stays continuous.
      if (primalResidual > 10 * dualResidual && rho < 1e6) {
        rho *= 2;
        for (let r = 0; r < m; r++) y[r] /= 2;
      } else if (dualResidual > 10 * primalResidual && rho > 1e-6) {
        rho /= 2;
        for (let r = 0; r < m; r++) y[r] *= 2;
      }
    }
  }

  return {
    x: Float64Array.from(x),
    status: 'max-iterations',
    iterations: maxIter,
    primalResidual,
    dualResidual,
  };
};
