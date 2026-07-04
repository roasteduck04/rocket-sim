/**
 * Real-time linear aircraft simulation (README §6.4).
 *
 * The longitudinal and lateral channels are decoupled by construction, so
 * `AircraftSim` integrates the two 4-state systems independently with the shared
 * fixed-step RK4 (`dt = 1/60 s` to match display refresh). `doubletInput`
 * generates the canned mode-excitation pulses (README §6.4 / §10.4).
 */

import { rk4Step, type Deriv } from '@fds/physics-core';
import { buildLonStateSpace, buildLatStateSpace, type StateSpace } from './stateSpace.js';
import type {
  AircraftConfig,
  ControlsLon,
  ControlsLat,
  LonState,
  LatState,
} from './types.js';

/** ẋ = A·x + B·u for a 4-state, 2-input linear system. */
const linearDeriv =
  (ss: StateSpace): Deriv<readonly [number, number]> =>
  (_t, x, u) => {
    const { A, B } = ss;
    const out = new Float64Array(4);
    for (let i = 0; i < 4; i++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += A[i][j] * x[j];
      s += B[i][0] * u[0] + B[i][1] * u[1];
      out[i] = s;
    }
    return out;
  };

const toTuple = (x: Float64Array): [number, number, number, number] => [x[0], x[1], x[2], x[3]];

export interface AircraftSimState {
  /** Simulation time, s. */
  t: number;
  /** Longitudinal state `[Δu, α, q, θ]`. */
  lon: LonState;
  /** Lateral state `[β, p, r, φ]`. */
  lat: LatState;
}

export interface InitialState {
  lon?: LonState;
  lat?: LatState;
}

/**
 * Stateful real-time simulator for one aircraft configuration. The state-space
 * matrices are built once at construction; `step` advances both channels by `dt`.
 */
export class AircraftSim {
  readonly lonSS: StateSpace;
  readonly latSS: StateSpace;
  private readonly derivLon: Deriv<readonly [number, number]>;
  private readonly derivLat: Deriv<readonly [number, number]>;
  private xLon: Float64Array;
  private xLat: Float64Array;
  private time = 0;

  constructor(cfg: AircraftConfig) {
    this.lonSS = buildLonStateSpace(cfg);
    this.latSS = buildLatStateSpace(cfg);
    this.derivLon = linearDeriv(this.lonSS);
    this.derivLat = linearDeriv(this.latSS);
    this.xLon = new Float64Array(4);
    this.xLat = new Float64Array(4);
  }

  /** Reset time to 0 and set initial states (defaults to trim, i.e. all zeros). */
  reset(init: InitialState = {}): void {
    this.time = 0;
    this.xLon = Float64Array.from(init.lon ?? [0, 0, 0, 0]);
    this.xLat = Float64Array.from(init.lat ?? [0, 0, 0, 0]);
  }

  /** Advance both channels by `dt` (default 1/60 s) under the given controls. */
  step(uLon: ControlsLon, uLat: ControlsLat, dt = 1 / 60): void {
    this.xLon = rk4Step(this.derivLon, this.time, this.xLon, uLon, dt);
    this.xLat = rk4Step(this.derivLat, this.time, this.xLat, uLat, dt);
    this.time += dt;
  }

  get state(): AircraftSimState {
    return { t: this.time, lon: toTuple(this.xLon), lat: toTuple(this.xLat) };
  }
}

/**
 * Doublet input generator (README §6.4): `+amplitude` over `[t0, t0+width)`,
 * `−amplitude` over `[t0+width, t0+2·width)`, and 0 elsewhere. Returns a pure
 * function of time so it composes with any control channel.
 */
export const doubletInput = (
  t0: number,
  width: number,
  amplitude: number,
): ((t: number) => number) => {
  return (t: number): number => {
    if (t < t0 || t >= t0 + 2 * width) return 0;
    return t < t0 + width ? amplitude : -amplitude;
  };
};
