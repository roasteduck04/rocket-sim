/**
 * Modal analysis (README §6.5) and the closed-form mode approximations
 * (README §6.2/§6.3) used for the UI readout and as an eigenvalue sanity check.
 *
 * `modalAnalysis(A)` finds the eigenvalues with the shared 4×4 solver, collapses
 * complex-conjugate pairs into single oscillatory modes, and classifies them
 * from the eigenvalue STRUCTURE:
 *   - two oscillatory pairs        → longitudinal: short-period (higher ω_n),
 *                                    phugoid (lower ω_n);
 *   - one pair + two real roots    → lateral: dutch-roll (the pair), roll (the
 *                                    faster real root), spiral (the slower one).
 * Other structures are reported with name `unknown` (e.g. an overdamped phugoid
 * that has split into two real roots). See `docs/equations.md` Phase 1.
 */

import { eig4x4, G0, type Complex } from '@fds/physics-core';
import {
  dimensionalizeLon,
  dimensionalizeLat,
  trimDynamicPressure,
} from './dimensionalize.js';
import type { AircraftConfig, Matrix4, ModeReport, ModeKind } from './types.js';

const LN2 = Math.log(2);

/** True when an eigenvalue's imaginary part is numerically nonzero. */
const isOscillatory = (lambda: Complex): boolean =>
  Math.abs(lambda.im) > 1e-6 * Math.max(1, Math.hypot(lambda.re, lambda.im));

interface RawMode {
  /** Canonical eigenvalue (the +imaginary member of an oscillatory pair). */
  lambda: Complex;
  oscillatory: boolean;
}

/** Collapse four eigenvalues into modes (conjugate pairs → one oscillatory mode). */
const groupModes = (eigs: Complex[]): RawMode[] => {
  const used = new Array<boolean>(eigs.length).fill(false);
  const modes: RawMode[] = [];

  for (let i = 0; i < eigs.length; i++) {
    if (used[i]) continue;
    const li = eigs[i];
    if (!isOscillatory(li)) {
      used[i] = true;
      modes.push({ lambda: li, oscillatory: false });
      continue;
    }
    // Find the best conjugate partner (matching re, opposite im).
    let best = -1;
    let bestErr = Infinity;
    for (let j = i + 1; j < eigs.length; j++) {
      if (used[j]) continue;
      const err = Math.abs(li.re - eigs[j].re) + Math.abs(li.im + eigs[j].im);
      if (err < bestErr) {
        bestErr = err;
        best = j;
      }
    }
    used[i] = true;
    if (best >= 0) used[best] = true;
    // Canonicalise to the +imaginary representative.
    const lambda = li.im >= 0 ? li : { re: li.re, im: -li.im };
    modes.push({ lambda, oscillatory: true });
  }
  return modes;
};

/** Build a ModeReport (sans classification) from a single eigenvalue. */
const report = (name: ModeKind, m: RawMode): ModeReport => {
  const sigma = m.lambda.re;
  const omegaD = Math.abs(m.lambda.im);
  const wn = Math.hypot(sigma, omegaD);
  const zeta = wn === 0 ? 0 : -sigma / wn;
  const isDoubling = sigma > 0;
  const tHalfOrDouble = sigma === 0 ? Infinity : LN2 / Math.abs(sigma);
  const period = m.oscillatory && omegaD > 0 ? (2 * Math.PI) / omegaD : Infinity;
  return {
    name,
    eigenvalue: m.lambda,
    wn,
    zeta,
    tHalfOrDouble,
    isDoubling,
    period,
    oscillatory: m.oscillatory,
  };
};

/**
 * Eigenvalues of a longitudinal/lateral A matrix → classified mode reports
 * (README §6.5).
 */
export const modalAnalysis = (A: Matrix4): ModeReport[] => {
  const modes = groupModes(eig4x4(A));
  const osc = modes.filter((m) => m.oscillatory);
  const real = modes.filter((m) => !m.oscillatory);

  if (osc.length === 2 && real.length === 0) {
    // Longitudinal: higher ω_n → short-period, lower → phugoid.
    const byWn = [...osc].sort(
      (a, b) => Math.hypot(b.lambda.re, b.lambda.im) - Math.hypot(a.lambda.re, a.lambda.im),
    );
    return [report('short-period', byWn[0]), report('phugoid', byWn[1])];
  }

  if (osc.length === 1 && real.length === 2) {
    // Lateral: pair → dutch-roll; faster real → roll; slower real → spiral.
    const byMag = [...real].sort((a, b) => Math.abs(b.lambda.re) - Math.abs(a.lambda.re));
    return [
      report('dutch-roll', osc[0]),
      report('roll', byMag[0]),
      report('spiral', byMag[1]),
    ];
  }

  // Unrecognised structure — still report the modes, unnamed.
  return modes.map((m) => report('unknown', m));
};

// ---------------------------------------------------------------------------
// Closed-form approximations (README §6.2/§6.3) — UI readout + sanity check.
// ---------------------------------------------------------------------------

export interface ModeApprox {
  wn: number;
  zeta: number;
}

/** Short-period approximation (README §6.2). */
export const approxShortPeriod = (cfg: AircraftConfig, qbar?: number): ModeApprox => {
  const d = dimensionalizeLon(cfg, qbar ?? trimDynamicPressure(cfg));
  const U0 = cfg.trim.U0Mps;
  const wn = Math.sqrt(Math.max(0, (d.Mq * d.Zalpha) / U0 - d.Malpha));
  const zeta = wn === 0 ? 0 : -(d.Mq + d.Zalpha / U0 + d.Malphadot) / (2 * wn);
  return { wn, zeta };
};

/** Phugoid (Lanchester) approximation (README §6.2). */
export const approxPhugoid = (cfg: AircraftConfig, _qbar?: number): ModeApprox => {
  const U0 = cfg.trim.U0Mps;
  const wn = (G0 * Math.SQRT2) / U0;
  const ld = cfg.lon.CD0 > 0 ? cfg.lon.CL0 / cfg.lon.CD0 : Infinity;
  const zeta = Number.isFinite(ld) ? 1 / (Math.SQRT2 * ld) : 0;
  return { wn, zeta };
};

/** Dutch-roll approximation (README §6.3). */
export const approxDutchRoll = (cfg: AircraftConfig, qbar?: number): ModeApprox => {
  const d = dimensionalizeLat(cfg, qbar ?? trimDynamicPressure(cfg));
  const U0 = cfg.trim.U0Mps;
  const wn = Math.sqrt(Math.max(0, d.Nbeta + (d.Ybeta * d.Nr) / U0));
  const zeta = wn === 0 ? 0 : -(d.Nr + d.Ybeta / U0) / (2 * wn);
  return { wn, zeta };
};

/** Roll-subsidence time constant τ_roll ≈ −1/Lp (README §6.3). */
export const approxRollTau = (cfg: AircraftConfig, qbar?: number): number => {
  const d = dimensionalizeLat(cfg, qbar ?? trimDynamicPressure(cfg));
  return -1 / d.Lp;
};

/**
 * Spiral-mode time constant τ_spiral ≈ −1/λ_spiral with the reduced-order root
 * λ_spiral ≈ (Lβ·Nr − Lr·Nβ)/Lβ (README §6.3; full determinant expansion in
 * `docs/equations.md`). Positive τ ⇒ stable (convergent) spiral.
 */
export const approxSpiralTau = (cfg: AircraftConfig, qbar?: number): number => {
  const d = dimensionalizeLat(cfg, qbar ?? trimDynamicPressure(cfg));
  const lambda = (d.Lbeta * d.Nr - d.Lr * d.Nbeta) / d.Lbeta;
  return -1 / lambda;
};
