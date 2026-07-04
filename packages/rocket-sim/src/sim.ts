/**
 * Rocket run driver (README §4.7).
 *
 * Fixed-step RK4 at `dt = 0.01 s` (README §3.4). The quaternion is renormalized
 * after every accepted step (README §10.1); the gimbal command is evaluated once
 * per step and held constant across the RK4 sub-steps (zero-order hold). A
 * simple ground constraint holds the vehicle at rest until thrust exceeds weight,
 * so a low initial thrust-to-weight never sinks it through the pad. Detects
 * burnout, apogee, and ground impact, and reports the README §4.7 summary
 * metrics (apogee, max Mach, max-Q, peak axial/lateral g). Deterministic — no
 * wall-clock, no randomness (README §1).
 *
 * Phase 4 adds `runLandingSim`: the same driver, started from a nose-up
 * descending state under `poweredDescentGuidance`, with the ground-impact
 * event doubling as touchdown detection and the §4.7 landing metrics reported
 * in `summary.landing`.
 */

import {
  G0,
  qfromEuler321,
  qtoEuler321,
  rotateBodyToNED,
  rotateNEDtoBody,
  rk4Step,
  vadd,
  vnorm,
  vscale,
  gravityAtAltitude,
} from '@fds/physics-core';
import { atmosphere, windAtAltitude } from '@fds/atmosphere-models';
import { packState, unpackState, renormalizeQuat } from './state.js';
import { massProps } from './massProperties.js';
import { aeroForcesMoments } from './aero.js';
import { thrustAt, thrustCurveAt } from './propulsion.js';
import { thrustForceMoment, GimbalActuator } from './tvc.js';
import { derivRocket } from './deriv.js';
import type { GuidanceMode } from './guidance.js';
import { poweredDescentGuidance } from './guidance/landing.js';
import type {
  GimbalCommand,
  RocketConfig,
  RocketEnv,
  RocketState,
  RunSummary,
  TelemetryFrame,
} from './types.js';

/** Options for {@link runRocketSim}. */
export interface RunOptions {
  /** Fixed timestep, s (README §3.4 default 0.01). */
  dt?: number;
  /** Hard time cap, s (default 1000). */
  maxTime?: number;
  /** Initial state; defaults to a vertical, at-rest, full-mass vehicle on the pad. */
  initialState?: RocketState;
  env?: RocketEnv;
  /** Record every Nth step in the telemetry (default 1 = every step). */
  sampleEvery?: number;
  /**
   * Enable the pad ground-hold + impact stop (default true). Disable for a free
   * ballistic point-mass validation launched away from the ground.
   */
  groundConstraint?: boolean;
}

/** A vertical, at-rest, full-propellant vehicle on the pad (README §4.1). */
export const initialVerticalState = (cfg: RocketConfig): RocketState => ({
  r: { x: 0, y: 0, z: 0 },
  v: { x: 0, y: 0, z: 0 },
  // Nose (+X body) points up (−Z NED): a 90° nose-up pitch about body Y.
  q: qfromEuler321(0, Math.PI / 2, 0),
  omega: { x: 0, y: 0, z: 0 },
  mass: cfg.mass.dryKg + cfg.mass.propellantKg,
});

interface DerivedFrame {
  frame: TelemetryFrame;
  axialG: number;
  lateralG: number;
  climbRate: number;
}

/** Recompute the telemetry-frame quantities for a state under given controls. */
const deriveFrame = (
  t: number,
  s: RocketState,
  controls: GimbalCommand,
  cfg: RocketConfig,
  env: RocketEnv,
): DerivedFrame => {
  const h = -s.r.z;
  const atmo = atmosphere(h);
  const mProp = s.mass - cfg.mass.dryKg;
  const mp = massProps(cfg.mass, mProp);
  const m = Math.max(s.mass, cfg.mass.dryKg);

  const windNED = env.wind ? windAtAltitude(env.wind, h) : { x: 0, y: 0, z: 0 };
  const windBody = rotateNEDtoBody(s.q, windNED);
  const aero = aeroForcesMoments(cfg.geometry, cfg.aero, {
    vBody: s.v,
    windBody,
    omega: s.omega,
    rho: atmo.rho,
    a: atmo.a,
    cgFromNose: mp.cgFromNose,
  });

  const burning = mProp > 0;
  const raw = thrustAt(cfg.propulsion, t, atmo.p);
  const throttle = Math.min(1, Math.max(0, controls.throttle));
  const T = burning ? raw.T * throttle : 0;
  const thrust = thrustForceMoment(T, controls.deltaP, controls.deltaY, mp.cgFromNose, cfg.propulsion.gimbal);

  // Specific force (non-gravity) → load factors.
  const fBody = vscale(vadd(aero.F, thrust.F), 1 / m);
  const axialG = Math.abs(fBody.x) / G0;
  const lateralG = Math.hypot(fBody.y, fBody.z) / G0;

  const vNED = rotateBodyToNED(s.q, s.v);
  const climbRate = -vNED.z;

  const euler = qtoEuler321(s.q);
  const frame: TelemetryFrame = {
    t,
    r: s.r,
    v: s.v,
    speed: aero.speed || vnorm(s.v),
    mach: aero.mach,
    alpha: aero.alpha,
    beta: aero.beta,
    qbar: aero.qbar,
    euler,
    omega: s.omega,
    mass: s.mass,
    staticMargin: aero.staticMargin,
    deltaP: controls.deltaP,
    deltaY: controls.deltaY,
    throttle,
    altitude: h,
  };
  return { frame, axialG, lateralG, climbRate };
};

export interface RunResult {
  telemetry: TelemetryFrame[];
  summary: RunSummary;
  /** Exact end-of-run state (the touchdown state for landing runs). */
  finalState: RocketState;
  /**
   * Non-gravitational load factors at the last derived frame, g. On a ground-
   * impact exit this is evaluated at the touchdown state itself; on a time-cap
   * exit it lags the final state by one step.
   */
  finalLoads: { axialG: number; lateralG: number };
}

/**
 * Run an open-loop rocket ascent (README §4). Steps RK4 to ground impact, apogee
 * turnaround into descent, or `maxTime`, whichever comes first.
 */
export const runRocketSim = (
  cfg: RocketConfig,
  guidance: GuidanceMode,
  opts: RunOptions = {},
): RunResult => {
  const dt = opts.dt ?? 0.01;
  const maxTime = opts.maxTime ?? 1000;
  const env = opts.env ?? {};
  const sampleEvery = Math.max(1, Math.floor(opts.sampleEvery ?? 1));
  const useGround = opts.groundConstraint ?? true;

  const actuator = new GimbalActuator(cfg.propulsion.gimbal);
  let s = opts.initialState ?? initialVerticalState(cfg);
  let x = packState(s);
  let t = 0;

  const telemetry: TelemetryFrame[] = [];
  const summary: RunSummary = {
    apogeeAltitude: -Infinity,
    apogeeTime: 0,
    maxMach: 0,
    maxQbar: 0,
    maxQbarTime: 0,
    maxAxialG: 0,
    maxAxialGTime: 0,
    maxLateralG: 0,
    maxLateralGTime: 0,
    burnoutTime: null,
    flightTime: 0,
  };

  let lifted = !useGround || s.r.z < 0; // already airborne if launched above ground
  let everAirborne = lifted;
  let step = 0;

  // Property holder (not a plain local): `record` is a closure, and TS's flow
  // narrowing can't see its assignments from the return site below.
  const derived: { last: DerivedFrame | null } = { last: null };
  // `force` records the frame regardless of sampling — used for the terminal
  // (ground-impact) frame so landing metrics always see the touchdown state.
  const record = (df: DerivedFrame, force = false): void => {
    derived.last = df;
    if (force || step % sampleEvery === 0) telemetry.push(df.frame);
    const h = df.frame.altitude;
    if (h > summary.apogeeAltitude) {
      summary.apogeeAltitude = h;
      summary.apogeeTime = t;
    }
    if (df.frame.mach > summary.maxMach) summary.maxMach = df.frame.mach;
    if (df.frame.qbar > summary.maxQbar) {
      summary.maxQbar = df.frame.qbar;
      summary.maxQbarTime = t;
    }
    if (df.axialG > summary.maxAxialG) {
      summary.maxAxialG = df.axialG;
      summary.maxAxialGTime = t;
    }
    if (df.lateralG > summary.maxLateralG) {
      summary.maxLateralG = df.lateralG;
      summary.maxLateralGTime = t;
    }
  };

  while (t < maxTime) {
    s = unpackState(x);
    const mProp = s.mass - cfg.mass.dryKg;
    if (summary.burnoutTime === null && mProp <= 0 && everAirborne) {
      summary.burnoutTime = t;
    }

    const cmd = guidance.command(t, s);
    const act = actuator.update(cmd.deltaP, cmd.deltaY, dt);
    const controls: GimbalCommand = { deltaP: act.deltaP, deltaY: act.deltaY, throttle: cmd.throttle };

    const df = deriveFrame(t, s, controls, cfg, env);
    record(df);

    // Pad ground-hold: stay at rest until thrust overcomes weight.
    if (useGround && !lifted) {
      const rawT = thrustCurveAt(cfg.propulsion.thrustCurve, t) * Math.min(1, Math.max(0, cmd.throttle));
      const weight = s.mass * gravityAtAltitude(0);
      if (rawT > weight) {
        lifted = true;
        everAirborne = true;
      } else {
        t += dt;
        step += 1;
        continue; // held on the pad, no integration
      }
    }

    // Integrate one step.
    x = rk4Step(derivRocket, t, x, { cfg, controls, env }, dt);
    renormalizeQuat(x);
    t += dt;
    step += 1;

    const sNext = unpackState(x);
    const hNext = -sNext.r.z;
    if (hNext > 0) everAirborne = true;

    // Ground impact after having been airborne.
    if (useGround && everAirborne && hNext <= 0) {
      const cmdN = guidance.command(t, sNext);
      const dfN = deriveFrame(t, sNext, { ...cmdN, deltaP: act.deltaP, deltaY: act.deltaY }, cfg, env);
      record(dfN, true);
      break;
    }
  }

  summary.flightTime = t;
  if (summary.apogeeAltitude === -Infinity) summary.apogeeAltitude = 0;
  return {
    telemetry,
    summary,
    finalState: unpackState(x),
    finalLoads: derived.last
      ? { axialG: derived.last.axialG, lateralG: derived.last.lateralG }
      : { axialG: 0, lateralG: 0 },
  };
};

// ---------------------------------------------------------------------------
// Powered-descent scenario runner (plan Phase 4)
// ---------------------------------------------------------------------------

/**
 * Initial condition for a landing-burn run (plan Phase 4 / A8: the MVP descent
 * scenario starts already descending from a few km; the boostback arc is a
 * stretch goal).
 */
export interface LandingScenario {
  /** Initial altitude, m. */
  altitudeM: number;
  /** Initial descent rate, m/s (+ down). */
  descentRateMps: number;
  /** Initial NED position offset from the origin, m (default 0). */
  northM?: number;
  eastM?: number;
  /** Initial horizontal velocity, m/s (default 0). */
  vNorthMps?: number;
  vEastMps?: number;
  /** Propellant remaining at scenario start, kg. */
  propellantKg: number;
}

/** Nose-up (engine-down), descending initial state for a landing run. */
export const initialDescentState = (cfg: RocketConfig, sc: LandingScenario): RocketState => {
  const q = qfromEuler321(0, Math.PI / 2, 0); // +X body = up, gimbal at the tail
  const vNED = { x: sc.vNorthMps ?? 0, y: sc.vEastMps ?? 0, z: sc.descentRateMps };
  return {
    r: { x: sc.northM ?? 0, y: sc.eastM ?? 0, z: -sc.altitudeM },
    v: rotateNEDtoBody(q, vNED),
    q,
    omega: { x: 0, y: 0, z: 0 },
    mass: cfg.mass.dryKg + sc.propellantKg,
  };
};

/** Options for {@link runLandingSim} (initial state comes from the scenario). */
export type LandingRunOptions = Omit<RunOptions, 'initialState' | 'groundConstraint'>;

/**
 * Run a powered-descent landing burn (README §4.6 mode 3) and report the
 * landing metrics in `summary.landing` (README §4.7 "landing accuracy").
 *
 * The landing engine is a constant rating scaled by throttle (plan A7), so the
 * config's time-based ascent thrust curve is replaced by a flat curve at
 * `control.descent.rated_thrust_n` covering the whole run. The run ends at
 * ground contact (the driver's h ≤ 0 impact event = touchdown detection) or at
 * `maxTime` if the vehicle never gets down.
 */
export const runLandingSim = (
  cfg: RocketConfig,
  scenario: LandingScenario,
  opts: LandingRunOptions = {},
): RunResult => {
  const descent = cfg.control?.descent;
  if (!descent) {
    throw new Error('runLandingSim: config has no "control.descent" section (README §8.1)');
  }
  const maxTime = opts.maxTime ?? 300;
  const landingCfg: RocketConfig = {
    ...cfg,
    propulsion: {
      ...cfg.propulsion,
      thrustCurve: {
        time: [0, maxTime + 1],
        thrust: [descent.ratedThrustN, descent.ratedThrustN],
      },
    },
  };

  const guidance = poweredDescentGuidance(landingCfg);
  const initialState = initialDescentState(cfg, scenario);
  const result = runRocketSim(landingCfg, guidance, {
    ...opts,
    maxTime,
    initialState,
    groundConstraint: true,
  });

  attachLandingMetrics(result, cfg, initialState.mass, guidance.ignitionTime);
  return result;
};

/**
 * Compute and attach the README §4.7 landing metrics to a finished run.
 * Shared by `runLandingSim` and the Phase-7 PDG/boostback runners.
 */
export const attachLandingMetrics = (
  result: RunResult,
  cfg: RocketConfig,
  initialMassKg: number,
  ignitionTime: number | null,
): void => {
  const target = cfg.control?.landingTarget ?? { northM: 0, eastM: 0, touchdownVzMaxMps: 2.0 };
  const fs = result.finalState;
  const vNED = rotateBodyToNED(fs.q, fs.v);
  result.summary.landing = {
    touchedDown: -fs.r.z <= 1e-9,
    ignitionTime,
    touchdownVz: vNED.z,
    touchdownLateralSpeed: Math.hypot(vNED.x, vNED.y),
    missDistance: Math.hypot(fs.r.x - target.northM, fs.r.y - target.eastM),
    touchdownG: Math.hypot(result.finalLoads.axialG, result.finalLoads.lateralG),
    propellantUsedKg: initialMassKg - fs.mass,
  };
};
