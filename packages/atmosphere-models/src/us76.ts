/**
 * US Standard Atmosphere 1976, 0–86 km (README §3.2).
 *
 * Piecewise-linear molecular temperature over 7 geopotential layers, with
 * hydrostatic pressure and the ideal-gas law. Input is GEOMETRIC altitude;
 * the geometric→geopotential conversion is done internally.
 */

import { G0, GAMMA_AIR, R_AIR, P0_SL } from '@fds/physics-core';

export interface AtmosphereSample {
  /** Temperature, K. */
  T: number;
  /** Pressure, Pa. */
  p: number;
  /** Density, kg/m³. */
  rho: number;
  /** Speed of sound, m/s. */
  a: number;
  /** True once the model is in the near-vacuum extension below the ρ threshold. */
  inVacuum: boolean;
}

/** US76 effective Earth radius for geopotential conversion, m (≠ gravity Re). */
const R0_US76 = 6_356_766;

// Layer base geopotential altitude (m), base temperature (K), lapse rate (K/m).
const H_BASE = [0, 11_000, 20_000, 32_000, 47_000, 51_000, 71_000];
const T_BASE = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65];
const L_RATE = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002];

// Base pressures, derived once by integrating hydrostatically up from sea level,
// so the piecewise profile is continuous across every layer boundary.
const P_BASE: number[] = (() => {
  const p = new Array<number>(H_BASE.length);
  p[0] = P0_SL;
  for (let i = 0; i < H_BASE.length - 1; i++) {
    const dH = H_BASE[i + 1] - H_BASE[i];
    const Tb = T_BASE[i];
    const L = L_RATE[i];
    if (L === 0) {
      p[i + 1] = p[i] * Math.exp((-G0 * dH) / (R_AIR * Tb));
    } else {
      const Ttop = Tb + L * dH;
      p[i + 1] = p[i] * Math.pow(Tb / Ttop, G0 / (R_AIR * L));
    }
  }
  return p;
})();

/** Geometric altitude (m) → geopotential altitude (m). */
export const geometricToGeopotential = (h: number): number =>
  (R0_US76 * h) / (R0_US76 + h);

/**
 * US76 state at a GEOMETRIC altitude. Valid 0–86 km; above the top layer the
 * layer-6 gradient formula is extrapolated (the unified `atmosphere` dispatcher
 * hands altitudes above 86 km to the exponential model instead).
 */
export const atmosphere = (hGeometric: number): AtmosphereSample => {
  const H = geometricToGeopotential(hGeometric);

  // Layer index = largest base at or below H (clamped to [0, 6]).
  let i = 0;
  for (let k = H_BASE.length - 1; k >= 0; k--) {
    if (H >= H_BASE[k]) {
      i = k;
      break;
    }
  }

  const Tb = T_BASE[i];
  const L = L_RATE[i];
  const pb = P_BASE[i];
  const dH = H - H_BASE[i];
  const T = Tb + L * dH;
  const p =
    L === 0
      ? pb * Math.exp((-G0 * dH) / (R_AIR * Tb))
      : pb * Math.pow(Tb / T, G0 / (R_AIR * L));
  const rho = p / (R_AIR * T);
  const a = Math.sqrt(GAMMA_AIR * R_AIR * T);
  return { T, p, rho, a, inVacuum: false };
};
