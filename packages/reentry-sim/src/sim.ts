/**
 * Reentry run driver (README §5.5; plan Phase 5).
 *
 * Adaptive Dormand–Prince RK45 (README §3.4: offline reentry runs use adaptive
 * stepping down to dt_min = 1e-3 s near peak heating), with the same
 * elementary step-size controller as `integrateAdaptive` but recording every
 * accepted step, so histories and peaks come from exactly the states the
 * integrator accepted. Termination events:
 *
 *  - `landed`          — h ≤ 0, bisection-refined to the surface crossing;
 *  - `skipped`         — post-perigee climb back above the entry-interface
 *                        altitude (plan A4; armed only after a real descent);
 *  - `limit-exceeded`  — optional early stop once a §8.2 limit is exceeded
 *                        (off by default: peaks are recorded either way and
 *                        classification compares peaks against limits);
 *  - `timeout`         — `maxTime` cap.
 *
 * Deterministic: pure floating-point recurrence, no wall-clock, no randomness
 * (README §1).
 */

import { rk45Step } from '@fds/physics-core';
import { derivReentry } from './deriv.js';
import { auxOutputs } from './outputs.js';
import { HeatLoadAccumulator } from './heating.js';
import { tauberSuttonEarth } from './radiative.js';
import {
  packReentryState,
  unpackReentryState,
  type BankProfile,
  type ReentryConfig,
  type ReentryFrame,
  type ReentryRun,
  type ReentryState,
  type TerminationReason,
} from './types.js';

/** Options for {@link runReentry}. */
export interface ReentryRunOptions {
  /** Bank-angle profile σ (README §5.1); default 0 (full lift-up). */
  bank?: BankProfile;
  /** Initial heading, rad from North toward East; default π/2 (due East). */
  psi0?: number;
  /** Entry-point latitude, rad; default 0. */
  lat0?: number;
  /** Entry-point longitude, rad; default 0. */
  lon0?: number;
  /**
   * Scalar integrator tolerance (atol = rtol); default 1e-8. Corridor
   * bisection (plan trap T3) requires this to stay ≥10× tighter than the
   * γ bisection tolerance — see corridor.ts.
   */
  tol?: number;
  /** Adaptive step floor, s (README §3.4 default 1e-3). */
  dtMin?: number;
  /** Adaptive step ceiling, s; default 10. */
  dtMax?: number;
  /** Initial step guess, s; default 1. */
  dtInit?: number;
  /** Hard cap on simulated time, s; default 5000. */
  maxTime?: number;
  /** Stop as soon as a §8.2 limit is exceeded (default false). */
  terminateOnLimits?: boolean;
  /** Include the J2 oblateness gravity term (README §3.3 toggle; default false). */
  j2?: boolean;
  /**
   * Include Tauber–Sutton radiative heating (README §5.2 optional secondary
   * term, Phase 7; default false). When on, the §8.2 heat-flux limit is
   * checked against the TOTAL (convective + radiative) flux.
   */
  radiative?: boolean;
  /** Record every Nth accepted step (default 1); terminal frame always kept. */
  sampleEvery?: number;
}

const DEFAULTS = {
  tol: 1e-8,
  dtMin: 1e-3,
  dtMax: 10,
  dtInit: 1,
  maxTime: 5000,
  sampleEvery: 1,
};

/**
 * Skip-out arming margin below the interface, m. The detector arms once the
 * vehicle has actually descended below the interface (plan A4: skip-out is a
 * POST-PERIGEE climb back above it); the margin only exists to ignore
 * numerical wiggle at t ≈ 0, so it is deliberately tiny. A large margin is a
 * trap: very shallow entries dip only a few hundred metres below the
 * interface before lift turns them around — those are textbook skips, and a
 * coarse margin would misclassify them (they then decay over multiple orbital
 * passes until timeout), breaking classifier monotonicity (plan trap T3).
 */
const SKIP_ARM_MARGIN_M = 1;

/**
 * Simulate one reentry from the entry interface (README §5.5).
 *
 * @param gammaEntryRad entry flight-path angle, rad (negative = descending)
 * @param vEntryMps     entry Earth-relative speed, m/s
 */
export const runReentry = (
  cfg: ReentryConfig,
  gammaEntryRad: number,
  vEntryMps: number,
  opts: ReentryRunOptions = {},
): ReentryRun => {
  const tol = opts.tol ?? DEFAULTS.tol;
  const dtMin = opts.dtMin ?? DEFAULTS.dtMin;
  const dtMax = opts.dtMax ?? DEFAULTS.dtMax;
  const maxTime = opts.maxTime ?? DEFAULTS.maxTime;
  const sampleEvery = Math.max(1, Math.floor(opts.sampleEvery ?? DEFAULTS.sampleEvery));
  const bankOf = (t: number, s: ReentryState): number =>
    typeof opts.bank === 'function' ? opts.bank(t, s) : (opts.bank ?? 0);

  const entry = { lat: opts.lat0 ?? 0, lon: opts.lon0 ?? 0 };
  const s0: ReentryState = {
    V: vEntryMps,
    gamma: gammaEntryRad,
    psi: opts.psi0 ?? Math.PI / 2,
    h: cfg.entryInterfaceAltitudeM,
    lat: entry.lat,
    lon: entry.lon,
  };

  let t = 0;
  let x = packReentryState(s0);
  let dt = Math.min(dtMax, Math.max(dtMin, opts.dtInit ?? DEFAULTS.dtInit));

  const radiative = opts.radiative ?? false;
  const history: ReentryFrame[] = [];
  const heat = new HeatLoadAccumulator();
  const heatRad = new HeatLoadAccumulator();
  let qdotSMax = 0;
  let tAtQdotSMax = 0;
  let qdotRMax = 0;
  let qdotTotalMax = 0;
  let nMax = 0;
  let tAtNMax = 0;
  let minH = s0.h;
  let accepted = 0;

  const record = (
    tNow: number,
    s: ReentryState,
    forceKeep: boolean,
  ): void => {
    const aux = auxOutputs(s, cfg, entry);
    const qdotR = radiative ? tauberSuttonEarth(aux.rho, s.V, cfg.noseRadiusM) : 0;
    heat.add(tNow, aux.qdotS);
    heatRad.add(tNow, qdotR);
    if (aux.qdotS > qdotSMax) {
      qdotSMax = aux.qdotS;
      tAtQdotSMax = tNow;
    }
    if (qdotR > qdotRMax) qdotRMax = qdotR;
    if (aux.qdotS + qdotR > qdotTotalMax) qdotTotalMax = aux.qdotS + qdotR;
    if (aux.nLoad > nMax) {
      nMax = aux.nLoad;
      tAtNMax = tNow;
    }
    if (forceKeep || accepted % sampleEvery === 0) {
      history.push({
        t: tNow,
        V: s.V,
        gamma: s.gamma,
        psi: s.psi,
        h: s.h,
        lat: s.lat,
        lon: s.lon,
        rho: aux.rho,
        mach: aux.mach,
        qbar: aux.qbar,
        qdotS: aux.qdotS,
        qdotR,
        nLoad: aux.nLoad,
        downrange: aux.downrange,
        bank: bankOf(tNow, s),
      });
    }
  };

  record(0, s0, true);

  // Same error norm and controller constants as physics-core integrateAdaptive.
  const n = x.length;
  const errorNorm = (xOld: Float64Array, y: Float64Array, err: Float64Array): number => {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const scale = tol + tol * Math.max(Math.abs(xOld[i]), Math.abs(y[i]));
      const e = err[i] / scale;
      acc += e * e;
    }
    return Math.sqrt(acc / n);
  };
  const facMin = 0.2;
  const facMax = 5.0;
  const safety = 0.9;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

  let reason: TerminationReason = 'timeout';

  while (t < maxTime) {
    if (t + dt > maxTime) dt = maxTime - t;

    const bank = bankOf(t, unpackReentryState(x));
    const deriv = (tt: number, xx: Float64Array): Float64Array =>
      derivReentry(tt, xx, cfg, bank, opts.j2 ?? false);
    const { y, err } = rk45Step((tt, xx) => deriv(tt, xx), t, x, undefined, dt);
    const en = errorNorm(x, y, err);

    if (en > 1 && dt > dtMin) {
      dt = Math.max(dtMin, dt * Math.max(facMin, safety * Math.pow(1 / en, 1 / 5)));
      continue;
    }

    // Accepted step.
    const hNext = y[3];

    if (hNext <= 0) {
      // Bisect the ground crossing on the step fraction (touchdown event).
      let lo = 0;
      let hi = dt;
      for (let it = 0; it < 100 && hi - lo > 1e-9; it++) {
        const mid = (lo + hi) / 2;
        const xm = rk45Step((tt, xx) => deriv(tt, xx), t, x, undefined, mid).y;
        if (xm[3] > 0) lo = mid;
        else hi = mid;
      }
      const hEvent = (lo + hi) / 2;
      x = rk45Step((tt, xx) => deriv(tt, xx), t, x, undefined, hEvent).y;
      t += hEvent;
      accepted += 1;
      reason = 'landed';
      record(t, unpackReentryState(x), true);
      break;
    }

    t += dt;
    x = y;
    accepted += 1;
    minH = Math.min(minH, hNext);
    const armed = minH < cfg.entryInterfaceAltitudeM - SKIP_ARM_MARGIN_M;
    const terminal =
      (armed && hNext > cfg.entryInterfaceAltitudeM) || t >= maxTime;
    record(t, unpackReentryState(x), terminal);

    if (armed && hNext > cfg.entryInterfaceAltitudeM) {
      reason = 'skipped';
      break;
    }

    if (
      opts.terminateOnLimits &&
      (qdotTotalMax > cfg.limits.maxHeatFluxWm2 || nMax > cfg.limits.maxGLoad)
    ) {
      reason = 'limit-exceeded';
      // The triggering frame may fall between samples; keep it.
      if (history[history.length - 1]?.t !== t) record(t, unpackReentryState(x), true);
      break;
    }

    const fac = en === 0 ? facMax : safety * Math.pow(1 / en, 1 / 5);
    dt = clamp(dt * clamp(fac, facMin, facMax), dtMin, dtMax);
  }

  const final = unpackReentryState(x);
  const finalAux = auxOutputs(final, cfg, entry);
  return {
    history,
    peaks: {
      qdotSMax,
      tAtQdotSMax,
      qTotalJm2: heat.totalJm2,
      qdotRMax,
      qRadTotalJm2: heatRad.totalJm2,
      qdotTotalMax,
      nMax,
      tAtNMax,
      downrangeM: finalAux.downrange,
      flightTimeS: t,
      speedAtTerminationMps: final.V,
      limitsExceeded: qdotTotalMax > cfg.limits.maxHeatFluxWm2 || nMax > cfg.limits.maxGLoad,
      terminationReason: reason,
    },
  };
};
