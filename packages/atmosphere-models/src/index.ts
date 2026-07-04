/**
 * @fds/atmosphere-models — US Standard Atmosphere 1976, exponential extension,
 * and wind profiles (README §3.2). Exposes a single unified `atmosphere(h)`
 * dispatching between the US76 model (≤ 86 km) and the exponential extension.
 */

import { atmosphere as us76Atmosphere, type AtmosphereSample } from './us76.js';
import {
  exponentialExtension,
  HANDOFF_ALTITUDE_M,
  DEFAULT_VACUUM_THRESHOLD,
} from './exponential.js';

export type { AtmosphereSample } from './us76.js';
export { geometricToGeopotential } from './us76.js';
/** The raw US76 model (≤ 86 km); prefer the unified `atmosphere` below. */
export { atmosphere as us76Atmosphere } from './us76.js';
export * from './exponential.js';
export * from './wind.js';

export interface AtmosphereOptions {
  /** Density threshold below which the extension reports vacuum, kg/m³. */
  vacuumThreshold?: number;
}

/**
 * Unified atmosphere at GEOMETRIC altitude `h` (m): US76 up to 86 km, then the
 * continuity-matched exponential extension. Density is C0-continuous across the
 * handoff (README §3.2).
 */
export const atmosphere = (
  h: number,
  opts: AtmosphereOptions = {},
): AtmosphereSample => {
  if (h <= HANDOFF_ALTITUDE_M) return us76Atmosphere(h);
  return exponentialExtension(
    h,
    opts.vacuumThreshold ?? DEFAULT_VACUUM_THRESHOLD,
  );
};
