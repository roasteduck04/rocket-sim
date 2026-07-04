/**
 * Non-dimensional → dimensional stability-derivative conversion (README §6.2/§6.3).
 *
 * Formulas follow the standard Etkin/Nelson definitions and are mirrored in
 * `docs/equations.md` (Phase 1). Longitudinal rate derivatives are
 * non-dimensionalised on `c̄/(2U0)`; lateral rate derivatives on `b/(2U0)`.
 *
 * The dynamic pressure `q̄0 = ½·ρ0·U0²` defaults to the value implied by the
 * trim altitude via the US76 atmosphere, but can be passed explicitly (used by
 * the unit tests to keep the conversions independent of the atmosphere model).
 */

import { atmosphere } from '@fds/atmosphere-models';
import type { AircraftConfig, LonDimDerivs, LatDimDerivs } from './types.js';

/** Air density ρ0 at the trim altitude (US76), kg/m³. */
export const airDensityAtTrim = (cfg: AircraftConfig): number =>
  atmosphere(cfg.trim.altitudeM).rho;

/** Trim dynamic pressure q̄0 = ½·ρ0·U0², Pa. */
export const trimDynamicPressure = (cfg: AircraftConfig): number => {
  const u0 = cfg.trim.U0Mps;
  return 0.5 * airDensityAtTrim(cfg) * u0 * u0;
};

/** Dimensional longitudinal derivatives for README §6.2's A_lon/B_lon. */
export const dimensionalizeLon = (
  cfg: AircraftConfig,
  qbar: number = trimDynamicPressure(cfg),
): LonDimDerivs => {
  const { chordM: cbar } = cfg.geometry;
  const S = cfg.geometry.wingAreaM2;
  const { massKg: m, IyyKgm2: Iyy } = cfg.mass;
  const U0 = cfg.trim.U0Mps;
  const c = cfg.lon;

  const QS = qbar * S;
  const QSc = QS * cbar;

  return {
    // Force derivatives (÷ m·U0 for speed terms, ÷ m for α terms).
    Xu: -(c.CD_u + 2 * c.CD0) * QS / (m * U0),
    Xalpha: (c.CL0 - c.CD_alpha) * QS / m,
    Zu: -(c.CL_u + 2 * c.CL0) * QS / (m * U0),
    Zalpha: -(c.CL_alpha + c.CD0) * QS / m,
    Zq: -c.CL_q * QSc / (2 * m * U0),
    // Moment derivatives (÷ Iyy).
    Mu: c.Cm_u * QSc / (U0 * Iyy),
    Malpha: c.Cm_alpha * QSc / Iyy,
    Malphadot: c.Cm_alpha_dot * QSc * cbar / (2 * U0 * Iyy),
    Mq: c.Cm_q * QSc * cbar / (2 * U0 * Iyy),
    // Control derivatives.
    Xde: 0, // elevator axial-force contribution negligible (no CX_δe in §8.3)
    Zde: -c.CL_delta_e * QS / m,
    Mde: c.Cm_delta_e * QSc / Iyy,
    Xdt: c.X_delta_t,
  };
};

/** Dimensional lateral-directional derivatives for README §6.3's A_lat/B_lat. */
export const dimensionalizeLat = (
  cfg: AircraftConfig,
  qbar: number = trimDynamicPressure(cfg),
): LatDimDerivs => {
  const { spanM: b } = cfg.geometry;
  const S = cfg.geometry.wingAreaM2;
  const { massKg: m, IxxKgm2: Ixx, IzzKgm2: Izz } = cfg.mass;
  const U0 = cfg.trim.U0Mps;
  const c = cfg.lat;

  const QS = qbar * S;
  const QSb = QS * b;

  return {
    // Side-force derivatives (÷ m; rate terms carry b/(2U0)).
    Ybeta: c.CY_beta * QS / m,
    Yp: c.CY_p * QSb / (2 * m * U0),
    Yr: c.CY_r * QSb / (2 * m * U0),
    // Rolling-moment derivatives (÷ Ixx).
    Lbeta: c.Cl_beta * QSb / Ixx,
    Lp: c.Cl_p * QSb * b / (2 * U0 * Ixx),
    Lr: c.Cl_r * QSb * b / (2 * U0 * Ixx),
    // Yawing-moment derivatives (÷ Izz).
    Nbeta: c.Cn_beta * QSb / Izz,
    Np: c.Cn_p * QSb * b / (2 * U0 * Izz),
    Nr: c.Cn_r * QSb * b / (2 * U0 * Izz),
    // Control derivatives.
    Yda: c.CY_delta_a * QS / m,
    Ydr: c.CY_delta_r * QS / m,
    Lda: c.Cl_delta_a * QSb / Ixx,
    Ldr: c.Cl_delta_r * QSb / Ixx,
    Nda: c.Cn_delta_a * QSb / Izz,
    Ndr: c.Cn_delta_r * QSb / Izz,
  };
};
