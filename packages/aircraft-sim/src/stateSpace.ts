/**
 * Linearized state-space assembly (README §6.2 longitudinal, §6.3 lateral).
 *
 * Longitudinal state `x_lon = [Δu, α, q, θ]`, controls `u_lon = [δe, δt]`.
 * Lateral state `x_lat = [β, p, r, φ]`, controls `u_lat = [δa, δr]`.
 *
 * The M_α̇ (α̇) coupling is folded into row 3 of BOTH A and B, exactly as the
 * README A_lon writes it (`M_α + M_α̇·Z_α/U0`, etc.). Ixz product-of-inertia
 * coupling is neglected in the lateral rows (README writes pure-aero L/N rows;
 * §8.3 provides no Ixz). Gravity uses g0 (README §3.5 constant); the θ0-dependent
 * trig terms sit exactly where README places them (trap T4). See
 * `docs/equations.md` Phase 1.
 */

import { G0 } from '@fds/physics-core';
import { dimensionalizeLon, dimensionalizeLat, trimDynamicPressure } from './dimensionalize.js';
import type { AircraftConfig, Matrix4, Matrix4x2 } from './types.js';

export interface StateSpace {
  A: Matrix4;
  B: Matrix4x2;
}

/** Build the longitudinal A_lon/B_lon per README §6.2. */
export const buildLonStateSpace = (
  cfg: AircraftConfig,
  qbar: number = trimDynamicPressure(cfg),
): StateSpace => {
  const d = dimensionalizeLon(cfg, qbar);
  const U0 = cfg.trim.U0Mps;
  const th0 = cfg.trim.theta0Rad;
  const cth = Math.cos(th0);
  const sth = Math.sin(th0);

  // Convenience: the (1 + Z_q/U0) factor recurs in rows 2 and 3.
  const zqTerm = 1 + d.Zq / U0;

  const A: Matrix4 = [
    [d.Xu, d.Xalpha, 0, -G0 * cth],
    [d.Zu / U0, d.Zalpha / U0, zqTerm, -G0 * sth / U0],
    [
      d.Mu + d.Malphadot * (d.Zu / U0),
      d.Malpha + d.Malphadot * (d.Zalpha / U0),
      d.Mq + d.Malphadot * zqTerm,
      0,
    ],
    [0, 0, 1, 0],
  ];

  const B: Matrix4x2 = [
    [d.Xde, d.Xdt],
    [d.Zde / U0, 0],
    [d.Mde + d.Malphadot * (d.Zde / U0), 0],
    [0, 0],
  ];

  return { A, B };
};

/** Build the lateral-directional A_lat/B_lat per README §6.3. */
export const buildLatStateSpace = (
  cfg: AircraftConfig,
  qbar: number = trimDynamicPressure(cfg),
): StateSpace => {
  const d = dimensionalizeLat(cfg, qbar);
  const U0 = cfg.trim.U0Mps;
  const th0 = cfg.trim.theta0Rad;

  const A: Matrix4 = [
    [d.Ybeta / U0, d.Yp / U0, d.Yr / U0 - 1, (G0 * Math.cos(th0)) / U0],
    [d.Lbeta, d.Lp, d.Lr, 0],
    [d.Nbeta, d.Np, d.Nr, 0],
    [0, 1, Math.tan(th0), 0],
  ];

  const B: Matrix4x2 = [
    [d.Yda / U0, d.Ydr / U0],
    [d.Lda, d.Ldr],
    [d.Nda, d.Ndr],
    [0, 0],
  ];

  return { A, B };
};
