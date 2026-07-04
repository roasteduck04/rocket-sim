/**
 * Types for the linearized aircraft flight-dynamics model (README §6, §8.3).
 *
 * Conventions (see `docs/equations.md` Phase 1 for the full derivation):
 *  - Longitudinal state `x_lon = [Δu, α, q, θ]` — Δu is the DIMENSIONAL airspeed
 *    perturbation (m/s). README §6.2's prose calls the first state `û = Δu/U0`,
 *    but the A_lon matrix it writes out is the dimensional-Δu form (row-1 gravity
 *    term `−g·cosθ0`, row-2 col-1 `Z_u/U0`). We match the matrix exactly; the
 *    eigenvalues are identical under either scaling.
 *  - Lateral state `x_lat = [β, p, r, φ]` (β, φ in rad; p, r in rad/s).
 *  - All stored angles are radians; the YAML loader converts θ0 from degrees.
 *  - SI units throughout.
 */

import type { Complex } from '@fds/physics-core';

/** Reference geometry (README §8.3 `geometry`). */
export interface Geometry {
  /** Wing reference area S, m². */
  wingAreaM2: number;
  /** Mean aerodynamic chord c̄, m. */
  chordM: number;
  /** Wing span b, m. */
  spanM: number;
}

/** Mass and moments of inertia (README §8.3 `mass`). */
export interface MassProperties {
  massKg: number;
  /** Pitch inertia I_yy, kg·m². */
  IyyKgm2: number;
  /** Roll inertia I_xx, kg·m². */
  IxxKgm2: number;
  /** Yaw inertia I_zz, kg·m². */
  IzzKgm2: number;
}

/** Reference / trim flight condition (README §6.1, §8.3 `trim`). */
export interface TrimCondition {
  /** Trim airspeed U0, m/s. */
  U0Mps: number;
  /** Trim pitch attitude θ0, radians (≈ flight-path angle in level flight). */
  theta0Rad: number;
  /** Trim altitude, m (sets ρ0). */
  altitudeM: number;
}

/**
 * Non-dimensional longitudinal derivatives (README §8.3 + Ambiguity A2
 * extensions). The six §8.3 fields are required; the rest are optional in the
 * YAML and default per A2 (0, except CL0 which the loader computes from the
 * level-flight trim `CL0 = m·g / (q̄0·S)` when omitted).
 */
export interface LonNonDim {
  /** Trim lift coefficient (computed from trim if absent). */
  CL0: number;
  /** Parasite/zero-α drag coefficient (feeds phugoid damping via L/D). */
  CD0: number;
  CL_alpha: number;
  CD_alpha: number;
  Cm_alpha: number;
  Cm_q: number;
  Cm_alpha_dot: number;
  Cm_delta_e: number;
  /** Elevator lift derivative (default 0). */
  CL_delta_e: number;
  /** Speed derivatives (default 0 — negligible for subsonic props). */
  CL_u: number;
  CD_u: number;
  Cm_u: number;
  /** Pitch-rate lift derivative (default 0). */
  CL_q: number;
  /** Throttle force derivative X_δt, m/s² per unit throttle (direct-thrust, A2). */
  X_delta_t: number;
}

/**
 * Non-dimensional lateral-directional derivatives (README §8.3 + A2). The seven
 * §8.3 fields are required; the rest default to 0.
 *
 * Roll/yaw moment derivatives are the DIMENSIONLESS coefficients `Cl_*`, `Cn_*`;
 * their dimensional counterparts are named `Lbeta`, `Nbeta`, … in `LatDimDerivs`
 * — never `L` alone, to avoid the classic lift/rolling-moment symbol collision
 * (README §6.3 note).
 */
export interface LatNonDim {
  CY_beta: number;
  Cl_beta: number;
  Cn_beta: number;
  Cl_p: number;
  Cn_r: number;
  Cl_delta_a: number;
  Cn_delta_r: number;
  /** Optional cross/rate/control derivatives (default 0). */
  CY_p: number;
  CY_r: number;
  Cl_r: number;
  Cn_p: number;
  Cl_delta_r: number;
  Cn_delta_a: number;
  CY_delta_a: number;
  CY_delta_r: number;
}

/** Fully-resolved aircraft configuration (all defaults applied, SI, radians). */
export interface AircraftConfig {
  name: string;
  geometry: Geometry;
  mass: MassProperties;
  trim: TrimCondition;
  lon: LonNonDim;
  lat: LatNonDim;
}

/**
 * Dimensional longitudinal stability derivatives feeding README §6.2's A_lon/B_lon
 * (state `[Δu, α, q, θ]`, controls `[δe, δt]`). See `docs/equations.md` Phase 1.
 */
export interface LonDimDerivs {
  Xu: number;
  Xalpha: number;
  Zu: number;
  Zalpha: number;
  Zq: number;
  Mu: number;
  Malpha: number;
  /** M_α̇ — the α̇ (not ẇ) derivative, as used in README §6.2's coupling terms. */
  Malphadot: number;
  Mq: number;
  // control derivatives
  Xde: number;
  Zde: number;
  Mde: number;
  /** Throttle force derivative X_δt. */
  Xdt: number;
}

/**
 * Dimensional lateral-directional derivatives feeding README §6.3's A_lat/B_lat
 * (state `[β, p, r, φ]`, controls `[δa, δr]`). Ixz coupling is neglected (README
 * §6.3 writes pure-aero rows; §8.3 provides no product of inertia).
 */
export interface LatDimDerivs {
  Ybeta: number;
  Yp: number;
  Yr: number;
  Lbeta: number;
  Lp: number;
  Lr: number;
  Nbeta: number;
  Np: number;
  Nr: number;
  // control derivatives
  Yda: number;
  Ydr: number;
  Lda: number;
  Ldr: number;
  Nda: number;
  Ndr: number;
}

/** A 4×4 real matrix, row-major. */
export type Matrix4 = number[][];
/** A 4×2 real matrix, row-major (control-effectiveness B). */
export type Matrix4x2 = number[][];

/** Longitudinal state `[Δu (m/s), α (rad), q (rad/s), θ (rad)]`. */
export type LonState = [number, number, number, number];
/** Lateral state `[β (rad), p (rad/s), r (rad/s), φ (rad)]`. */
export type LatState = [number, number, number, number];
/** Longitudinal controls `[δe (rad), δt (throttle fraction)]`. */
export type ControlsLon = [number, number];
/** Lateral controls `[δa (rad), δr (rad)]`. */
export type ControlsLat = [number, number];

/** Classification of a dynamic mode. */
export type ModeKind =
  | 'short-period'
  | 'phugoid'
  | 'roll'
  | 'spiral'
  | 'dutch-roll'
  | 'unknown';

/**
 * A single dynamic mode extracted from an eigenvalue (README §6.5). For an
 * oscillatory (complex-conjugate) mode both `wn`/`zeta`/`period` are defined; for
 * a first-order (real) mode `zeta = 1`, `period = Infinity`, and `wn = |λ|`.
 */
export interface ModeReport {
  name: ModeKind;
  /** Representative eigenvalue (one of the conjugate pair for oscillatory modes). */
  eigenvalue: Complex;
  /** Undamped natural frequency ω_n, rad/s. */
  wn: number;
  /** Damping ratio ζ (1 for a real root, negative if unstable). */
  zeta: number;
  /**
   * Time to half amplitude (stable, real(λ) < 0) or time to double (unstable,
   * real(λ) > 0), seconds. `Infinity` for a neutrally-stable root.
   */
  tHalfOrDouble: number;
  /** Whether `tHalfOrDouble` is a doubling time (unstable mode). */
  isDoubling: boolean;
  /** Damped period, seconds (`Infinity` for a non-oscillatory mode). */
  period: number;
  /** True for complex-conjugate (oscillatory) modes. */
  oscillatory: boolean;
}
