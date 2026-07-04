/**
 * SI → display conversions at the UI boundary ONLY (plan Phase 6). Everything
 * below this file — the physics packages, the workers, the raw telemetry —
 * speaks SI units and radians exclusively; these helpers exist so no component
 * hand-rolls a conversion factor inline (README §3.5 philosophy).
 */

import { radToDeg, degToRad } from '@fds/physics-core';

export { radToDeg, degToRad };

/** Fixed-digit number for readouts; en-dash for non-finite values. */
export const fmt = (x: number, digits = 1): string =>
  Number.isFinite(x) ? x.toFixed(digits) : '–';

/** Metres shown as km with sensible digits. */
export const fmtKm = (m: number, digits = 2): string => fmt(m / 1000, digits);

/** Radians shown as degrees. */
export const fmtDeg = (rad: number, digits = 1): string => fmt(radToDeg(rad), digits);

/** W/m² shown as MW/m² (reentry heat-flux scale). */
export const fmtMWm2 = (wm2: number, digits = 2): string => fmt(wm2 / 1e6, digits);

/** Pa shown as kPa (dynamic-pressure scale). */
export const fmtKPa = (pa: number, digits = 1): string => fmt(pa / 1000, digits);

/** Seconds, tabular. */
export const fmtS = (s: number, digits = 1): string => fmt(s, digits);
