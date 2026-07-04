/**
 * Exponential atmosphere extension above the 86 km US76 ceiling (README §3.2).
 *
 * ρ(h) = ρ86·exp(−(h − h86)/H), with the scale height chosen from the 86 km
 * temperature so density is continuous across the handoff. An `inVacuum` flag
 * trips once density falls below a configurable threshold.
 */

import { G0, GAMMA_AIR, R_AIR } from '@fds/physics-core';
import { atmosphere as us76Atmosphere, type AtmosphereSample } from './us76.js';

/** Geometric altitude (m) at which US76 hands off to the exponential model. */
export const HANDOFF_ALTITUDE_M = 86_000;

/** Default density below which the model reports vacuum, kg/m³ (README §3.2). */
export const DEFAULT_VACUUM_THRESHOLD = 1e-9;

// Anchor the extension to the US76 state at the handoff altitude.
const boundary = us76Atmosphere(HANDOFF_ALTITUDE_M);
const RHO_86 = boundary.rho;
const T_86 = boundary.T;

/** Isothermal scale height H = R·T86/g0 (≈ 5.5 km), continuity-matched. */
export const SCALE_HEIGHT_M = (R_AIR * T_86) / G0;

const A_86 = Math.sqrt(GAMMA_AIR * R_AIR * T_86);

export const exponentialExtension = (
  h: number,
  vacuumThreshold: number = DEFAULT_VACUUM_THRESHOLD,
): AtmosphereSample => {
  const rho = RHO_86 * Math.exp(-(h - HANDOFF_ALTITUDE_M) / SCALE_HEIGHT_M);
  const p = rho * R_AIR * T_86;
  return { T: T_86, p, rho, a: A_86, inVacuum: rho < vacuumThreshold };
};
