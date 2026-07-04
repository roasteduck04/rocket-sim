/**
 * Propulsion: thrust-curve ingestion and instantaneous thrust / mass-flow
 * (README §4.4, plan A9).
 *
 * Thrust `T(t)` is read from a tabulated curve (linear interpolation). The mass
 * flow is derived from it via the pressure-corrected specific impulse
 * (A9 — the curve gives T(t) but no ṁ schedule):
 *
 * ```
 * Isp(h) = Isp_vac − (Isp_vac − Isp_sl)·(p(h)/p0)     (README §4.4)
 * ṁ      = T / (g0·Isp(h))
 * ```
 *
 * The caller cuts thrust once the propellant is exhausted and scales by throttle.
 */

import { G0, P0_SL } from '@fds/physics-core';
import type { Propulsion, ThrustCurve } from './types.js';

/**
 * Parse a thrust curve from CSV (`time,thrust`) or a RASP `.eng` file
 * (whitespace-separated `time thrust` pairs). Header rows (non-numeric first
 * field, e.g. a `.eng` motor-designation line), blank lines, and `;`/`#`
 * comments are skipped. Times must be strictly increasing.
 */
export const loadThrustCurve = (text: string): ThrustCurve => {
  const time: number[] = [];
  const thrust: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const parts = line.split(/[,\s]+/);
    // Skip header / motor-designation lines (first token not a number).
    if (parts.length < 2 || Number.isNaN(Number(parts[0]))) continue;
    const t = Number(parts[0]);
    const f = Number(parts[1]);
    if (!Number.isFinite(t) || !Number.isFinite(f)) {
      throw new Error(`thrust curve: non-numeric pair in "${line}"`);
    }
    if (time.length > 0 && t <= time[time.length - 1]) {
      throw new Error(`thrust curve: times must strictly increase (saw ${t} after ${time[time.length - 1]})`);
    }
    time.push(t);
    thrust.push(f);
  }
  if (time.length === 0) throw new Error('thrust curve: no data points');
  return { time, thrust };
};

/** Linear interpolation of the thrust curve; 0 outside its time span. */
export const thrustCurveAt = (curve: ThrustCurve, t: number): number => {
  const { time, thrust } = curve;
  const n = time.length;
  if (t <= time[0]) return t < time[0] ? 0 : thrust[0];
  if (t >= time[n - 1]) return 0; // burn complete
  let hi = 1;
  while (hi < n - 1 && time[hi] < t) hi++;
  const lo = hi - 1;
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return thrust[lo] + f * (thrust[hi] - thrust[lo]);
};

/** Pressure-corrected specific impulse Isp(p), s (README §4.4). */
export const ispAtPressure = (prop: Propulsion, pressurePa: number): number => {
  const ratio = pressurePa / P0_SL;
  return prop.ispVacuumS - (prop.ispVacuumS - prop.ispSeaLevelS) * ratio;
};

export interface ThrustSample {
  /** Thrust magnitude at full throttle, N. */
  T: number;
  /** Propellant mass-flow rate at full throttle, kg/s (≥ 0). */
  mdot: number;
  /** Specific impulse at the current ambient pressure, s. */
  isp: number;
}

/**
 * Full-throttle thrust and mass flow at time `t` and ambient pressure `p`
 * (README §4.4, A9). Throttle scaling and propellant-exhaustion cutoff are
 * applied by the caller (`deriv`).
 */
export const thrustAt = (prop: Propulsion, t: number, pressurePa: number): ThrustSample => {
  const T = thrustCurveAt(prop.thrustCurve, t);
  const isp = ispAtPressure(prop, pressurePa);
  const mdot = isp > 0 ? T / (G0 * isp) : 0;
  return { T, mdot, isp };
};
