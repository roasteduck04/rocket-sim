/**
 * Numerical integrators (README §3.4).
 *
 * - `rk4Step`      — classic fixed-step Runge–Kutta 4.
 * - `rk45Step`     — Dormand–Prince 5(4) single step with embedded error estimate.
 * - `integrateFixed`    — RK4 loop with optional bisection-refined terminal event.
 * - `integrateAdaptive` — DP45 with elementary step-size control + events.
 *
 * State is an opaque flat `Float64Array`; each module supplies its own
 * `deriv(t, x, u) -> xdot`. The integrators never inspect the contents. No
 * wall-clock, no randomness — runs are bit-reproducible (README §1).
 */

/** State-derivative function: returns ẋ as a new Float64Array. */
export type Deriv<U = unknown> = (
  t: number,
  x: Float64Array,
  u: U,
) => Float64Array;

/**
 * Terminal-event function. Returns a scalar g(t, x); a sign change between two
 * consecutive states brackets an event, whose time is then bisection-refined.
 */
export type EventFn = (t: number, x: Float64Array) => number;

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** out = x + s·k (new array). */
const axpy = (x: Float64Array, s: number, k: Float64Array): Float64Array => {
  const n = x.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] + s * k[i];
  return out;
};

// ---------------------------------------------------------------------------
// Single steps
// ---------------------------------------------------------------------------

/** One fixed RK4 step of size `dt`. */
export const rk4Step = <U>(
  deriv: Deriv<U>,
  t: number,
  x: Float64Array,
  u: U,
  dt: number,
): Float64Array => {
  const n = x.length;
  const half = dt / 2;
  const k1 = deriv(t, x, u);
  const k2 = deriv(t + half, axpy(x, half, k1), u);
  const k3 = deriv(t + half, axpy(x, half, k2), u);
  const k4 = deriv(t + dt, axpy(x, dt, k3), u);
  const out = new Float64Array(n);
  const s = dt / 6;
  for (let i = 0; i < n; i++) {
    out[i] = x[i] + s * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return out;
};

// Dormand–Prince 5(4) Butcher tableau.
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
// 5th-order weights (b) — also the 7th stage's a-row (FSAL).
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
// 4th-order weights (b̂).
const BH1 = 5179 / 57600, BH3 = 7571 / 16695, BH4 = 393 / 640, BH5 = -92097 / 339200, BH6 = 187 / 2100, BH7 = 1 / 40;
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;

export interface Rk45Result {
  /** 5th-order solution (the one to propagate). */
  y: Float64Array;
  /** Componentwise error estimate y5 − y4. */
  err: Float64Array;
}

/** One Dormand–Prince 5(4) step with embedded 4th-order error estimate. */
export const rk45Step = <U>(
  deriv: Deriv<U>,
  t: number,
  x: Float64Array,
  u: U,
  dt: number,
): Rk45Result => {
  const n = x.length;
  const lin = (terms: Array<[number, Float64Array]>): Float64Array => {
    const out = new Float64Array(x);
    for (const [coef, k] of terms) {
      if (coef === 0) continue;
      const c = dt * coef;
      for (let i = 0; i < n; i++) out[i] += c * k[i];
    }
    return out;
  };

  const k1 = deriv(t, x, u);
  const k2 = deriv(t + C2 * dt, lin([[A21, k1]]), u);
  const k3 = deriv(t + C3 * dt, lin([[A31, k1], [A32, k2]]), u);
  const k4 = deriv(t + C4 * dt, lin([[A41, k1], [A42, k2], [A43, k3]]), u);
  const k5 = deriv(t + C5 * dt, lin([[A51, k1], [A52, k2], [A53, k3], [A54, k4]]), u);
  const k6 = deriv(t + dt, lin([[A61, k1], [A62, k2], [A63, k3], [A64, k4], [A65, k5]]), u);

  const y = lin([[B1, k1], [B3, k3], [B4, k4], [B5, k5], [B6, k6]]);
  const k7 = deriv(t + dt, y, u);
  const y4 = lin([[BH1, k1], [BH3, k3], [BH4, k4], [BH5, k5], [BH6, k6], [BH7, k7]]);

  const err = new Float64Array(n);
  for (let i = 0; i < n; i++) err[i] = y[i] - y4[i];
  return { y, err };
};

// ---------------------------------------------------------------------------
// Event bisection (shared by both drivers)
// ---------------------------------------------------------------------------

/**
 * Given a single accepted step over [tBefore, tBefore+dtStep] whose event
 * function `g` changed sign, refine the event time by bisecting the step
 * fraction. `stepTo(h)` must return the state reached at `tBefore + h` from the
 * same starting state.
 */
const bisectEvent = (
  stepTo: (h: number) => Float64Array,
  g: EventFn,
  tBefore: number,
  gBefore: number,
  dtStep: number,
  eventTol: number,
): { time: number; x: Float64Array } => {
  let lo = 0;
  let hi = dtStep;
  const sBefore = sign(gBefore);
  for (let it = 0; it < 100 && hi - lo > eventTol; it++) {
    const mid = (lo + hi) / 2;
    const xm = stepTo(mid);
    const gm = g(tBefore + mid, xm);
    if (gm === 0) {
      lo = mid;
      hi = mid;
      break;
    }
    if (sign(gm) === sBefore) lo = mid;
    else hi = mid;
  }
  const hEvent = (lo + hi) / 2;
  return { time: tBefore + hEvent, x: stepTo(hEvent) };
};

// ---------------------------------------------------------------------------
// Fixed-step driver
// ---------------------------------------------------------------------------

export interface FixedOptions<U = unknown> {
  /** Integrate until this time (mutually exclusive with `steps`). */
  tEnd?: number;
  /** Integrate exactly this many steps of size `dt`. */
  steps?: number;
  /** Terminal event; integration stops at the first sign change of g(t, x). */
  terminate?: EventFn;
  /** Time tolerance for event bisection (default 1e-9 s). */
  eventTol?: number;
}

export interface IntegrationResult {
  t: number;
  x: Float64Array;
  /** Number of accepted steps taken. */
  steps: number;
  /** Present when a terminal event fired. */
  event?: { time: number };
}

/** RK4 fixed-step integration to `tEnd` or a step count, with optional event. */
export const integrateFixed = <U>(
  deriv: Deriv<U>,
  t0: number,
  x0: Float64Array,
  u: U,
  dt: number,
  opts: FixedOptions<U> = {},
): IntegrationResult => {
  const { tEnd, steps, terminate, eventTol = 1e-9 } = opts;
  if (tEnd === undefined && steps === undefined) {
    throw new Error('integrateFixed: provide either opts.tEnd or opts.steps');
  }
  if (dt <= 0) throw new Error('integrateFixed: dt must be positive');

  let t = t0;
  let x: Float64Array = new Float64Array(x0);
  let taken = 0;
  let gPrev = terminate ? terminate(t, x) : 0;

  const maxSteps =
    steps ?? Math.ceil((tEnd! - t0) / dt - 1e-9);

  for (let step = 0; step < maxSteps; step++) {
    // Shorten the final step so we land exactly on tEnd.
    let h = dt;
    if (tEnd !== undefined && t + h > tEnd) h = tEnd - t;
    if (h <= 0) break;

    const xBefore = x;
    const tBefore = t;
    const xNext = rk4Step(deriv, tBefore, xBefore, u, h);
    const tNext = tBefore + h;

    if (terminate) {
      const gNext = terminate(tNext, xNext);
      if (gPrev !== 0 && sign(gNext) !== sign(gPrev)) {
        const ev = bisectEvent(
          (hh) => rk4Step(deriv, tBefore, xBefore, u, hh),
          terminate,
          tBefore,
          gPrev,
          h,
          eventTol,
        );
        return { t: ev.time, x: ev.x, steps: taken + 1, event: { time: ev.time } };
      }
      gPrev = gNext;
    }

    x = xNext;
    t = tNext;
    taken += 1;
  }

  return { t, x, steps: taken };
};

// ---------------------------------------------------------------------------
// Adaptive driver (Dormand–Prince)
// ---------------------------------------------------------------------------

export interface AdaptiveOptions<U = unknown> {
  tEnd: number;
  /** Scalar tolerance used for both atol and rtol unless overridden. */
  tol?: number;
  atol?: number;
  rtol?: number;
  dtInit?: number;
  /** Step-size floor (README default 1e-3 s for reentry heating peaks). */
  dtMin?: number;
  dtMax?: number;
  terminate?: EventFn;
  eventTol?: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** DP45 adaptive integration to `tEnd`, with optional terminal event. */
export const integrateAdaptive = <U>(
  deriv: Deriv<U>,
  t0: number,
  x0: Float64Array,
  u: U,
  opts: AdaptiveOptions<U>,
): IntegrationResult => {
  const { tEnd, terminate, eventTol = 1e-9 } = opts;
  const tol = opts.tol ?? 1e-8;
  const atol = opts.atol ?? tol;
  const rtol = opts.rtol ?? tol;
  const span = tEnd - t0;
  const dtMin = opts.dtMin ?? 1e-3;
  const dtMax = opts.dtMax ?? Math.abs(span);
  let dt = clamp(opts.dtInit ?? Math.abs(span) / 100, dtMin, dtMax);

  const n = x0.length;
  let t = t0;
  let x: Float64Array = new Float64Array(x0);
  let taken = 0;
  let gPrev = terminate ? terminate(t, x) : 0;

  const facMin = 0.2;
  const facMax = 5.0;
  const safety = 0.9;

  const errorNorm = (xOld: Float64Array, y: Float64Array, err: Float64Array): number => {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const scale = atol + rtol * Math.max(Math.abs(xOld[i]), Math.abs(y[i]));
      const e = err[i] / scale;
      acc += e * e;
    }
    return Math.sqrt(acc / n);
  };

  const tiny = 1e-12 * Math.max(1, Math.abs(span));
  while (t < tEnd - tiny) {
    if (t + dt > tEnd) dt = tEnd - t;

    const { y, err } = rk45Step(deriv, t, x, u, dt);
    const en = errorNorm(x, y, err);

    if (en <= 1 || dt <= dtMin) {
      // Accept the step.
      if (terminate) {
        const gNext = terminate(t + dt, y);
        if (gPrev !== 0 && sign(gNext) !== sign(gPrev)) {
          const dtStep = dt;
          const xBefore = x;
          const tBefore = t;
          const ev = bisectEvent(
            (hh) => rk45Step(deriv, tBefore, xBefore, u, hh).y,
            terminate,
            tBefore,
            gPrev,
            dtStep,
            eventTol,
          );
          return { t: ev.time, x: ev.x, steps: taken + 1, event: { time: ev.time } };
        }
        gPrev = gNext;
      }
      t += dt;
      x = y;
      taken += 1;

      const fac = en === 0 ? facMax : safety * Math.pow(1 / en, 1 / 5);
      dt = clamp(dt * clamp(fac, facMin, facMax), dtMin, dtMax);
    } else {
      // Reject and shrink.
      const fac = safety * Math.pow(1 / en, 1 / 5);
      dt = Math.max(dtMin, dt * Math.max(facMin, fac));
    }
  }

  return { t, x, steps: taken };
};
