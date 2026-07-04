/**
 * Physical constants — single source of truth (README §3.5).
 * SI units throughout. Nothing elsewhere in the core should hardcode these.
 */

/** Standard gravitational acceleration at sea level, m/s². */
export const G0 = 9.80665;

/** Mean Earth radius used for the inverse-square gravity model, m (README §3.3). */
export const RE = 6_371_000;

/** Specific gas constant for dry air, J/(kg·K) (README §3.5). */
export const R_AIR = 287.05;

/** Ratio of specific heats for air. */
export const GAMMA_AIR = 1.4;

/** Sutton–Graves stagnation-point heating constant, SI (README §5.2). */
export const K_SUTTON_GRAVES = 1.7415e-4;

/** Earth rotation rate, rad/s (reentry rotating-Earth EOM, README §5.1). */
export const OMEGA_EARTH = 7.2921159e-5;

/**
 * Gravitational parameter used by the suite, m³/s². Derived as g0·Re² so that
 * the J2 model's central term reproduces §3.3's g(h) = g0·(Re/(Re+h))²
 * exactly — toggling J2 adds only the oblateness perturbation, with no jump
 * in the spherical baseline. (WGS-84 μ = 3.986004418e14 differs by ~0.15%,
 * consistent with the suite's use of the mean radius Re.)
 */
export const MU_EARTH = G0 * RE * RE;

/** Earth J2 zonal-harmonic coefficient, dimensionless (README §3.3 toggle). */
export const J2_EARTH = 1.08262668e-3;

/** Standard-day sea-level temperature, K. */
export const T0_SL = 288.15;

/** Standard-day sea-level pressure, Pa. */
export const P0_SL = 101_325;

/** Standard-day sea-level density, kg/m³. */
export const RHO0_SL = 1.225;
