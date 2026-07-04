/**
 * Entry-descent scenario (landing-sim spec §4, docs/superpowers/specs/
 * 2026-07-04-landing-sim-design.md): a high-altitude entry flown as
 *
 *  1. **coast** — engine off, gimbal zero (no thrust ⇒ no TVC authority,
 *     same convention as `landing.ts`); ballistic fall with real drag.
 *  2. **entryBurn** — below `entry_burn.ignite_altitude_m`, thrust axis held
 *     RETROGRADE (along −velocity via the shared direction-vector attitude
 *     controller, the same mechanism `boostback.ts` uses) at full throttle,
 *     until airspeed < `entry_burn.target_speed_mps` → engine cut.
 *  3. **descent** — every subsequent command delegates to the validated
 *     Phase-4 `poweredDescentGuidance` (its own coast → suicide-burn
 *     ignition → touchdown; no duplicated formulas).
 *
 * Config absent the `entry_burn` block degrades to plain powered descent.
 * All parameters come from the §8.1 config; nothing is hardcoded.
 */

import {
  qfromEuler321,
  rotateBodyToNED,
  rotateNEDtoBody,
  vnorm,
  vnormalize,
  vscale,
  type Vec3,
} from '@fds/physics-core';
import { AttitudeController } from '../control/attitudeControl.js';
import type { GuidanceMode } from '../guidance.js';
import type { GimbalCommand, RocketConfig, RocketState } from '../types.js';
import { poweredDescentGuidance } from './landing.js';
import {
  attachLandingMetrics,
  runRocketSim,
  type LandingRunOptions,
  type RunResult,
} from '../sim.js';

export type EntryDescentPhase = 'coast' | 'entryBurn' | 'descent';

/** Entry-descent guidance with its phase machine exposed for telemetry/tests. */
export interface EntryDescentGuidance extends GuidanceMode {
  readonly phase: EntryDescentPhase;
  /** Entry-burn ignition time, s (null while coasting / no entry burn). */
  readonly entryBurnIgnitionTime: number | null;
  /** Entry-burn engine-cut time, s (null until cutoff). */
  readonly entryBurnCutoffTime: number | null;
  /** Landing-burn ignition time from the delegated Phase-4 guidance. */
  readonly landingIgnitionTime: number | null;
}

/** Build the coast → entry-burn → powered-descent guidance (module header). */
export const entryDescentGuidance = (cfg: RocketConfig): EntryDescentGuidance => {
  const control = cfg.control;
  if (!control?.descent) {
    throw new Error(
      'entryDescentGuidance: config has no "control.descent" section (README §8.1)',
    );
  }
  const entryBurn = control.descent.entryBurn;
  const { max: thrMax } = cfg.propulsion.throttle;
  const attitude = new AttitudeController(control, cfg.propulsion.gimbal);
  const landing = poweredDescentGuidance(cfg);

  let phase: EntryDescentPhase = entryBurn ? 'coast' : 'descent';
  let ignitionTime: number | null = null;
  let cutoffTime: number | null = null;
  let lastT: number | null = null;

  return {
    get phase(): EntryDescentPhase {
      return phase;
    },
    get entryBurnIgnitionTime(): number | null {
      return ignitionTime;
    },
    get entryBurnCutoffTime(): number | null {
      return cutoffTime;
    },
    get landingIgnitionTime(): number | null {
      return landing.ignitionTime;
    },

    command(t: number, s: RocketState): GimbalCommand {
      if (phase === 'descent') return landing.command(t, s);
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      const h = -s.r.z;
      const vNED = rotateBodyToNED(s.q, s.v);

      if (phase === 'coast') {
        if (h > entryBurn!.igniteAltitudeM) {
          return { deltaP: 0, deltaY: 0, throttle: 0 }; // ballistic, no authority
        }
        phase = 'entryBurn';
        ignitionTime = t;
      }

      // Entry burn: retrograde full throttle until below the target speed.
      if (vnorm(vNED) <= entryBurn!.targetSpeedMps) {
        phase = 'descent';
        cutoffTime = t;
        return landing.command(t, s);
      }
      const dir = vnormalize(vscale(vNED, -1));
      const act = attitude.updateDirection(dir, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle: thrMax };
    },
  };
};

// ---------------------------------------------------------------------------
// Scenario runner (landing-sim spec §4 "entry state construction")
// ---------------------------------------------------------------------------

/** User-settable entry point for a landing-sim run. */
export interface EntryScenario {
  /** Entry altitude AGL, m. */
  altitudeM: number;
  /** Entry speed |V|, m/s. */
  speedMps: number;
  /** Flight-path angle, rad (negative = descending; −π/2 = straight down). */
  gammaRad: number;
  /** Downrange offset from the pad, m (starts south of it, flying north). */
  downrangeM: number;
  /** Propellant remaining at entry, kg. */
  propellantKg: number;
}

/** Retrograde (engine-first), descending initial state at the entry point. */
export const initialEntryState = (cfg: RocketConfig, sc: EntryScenario): RocketState => {
  // v_NED in the north–down plane from |V| and γ (γ<0 ⇒ v_z = −V·sinγ > 0, down).
  const vNED: Vec3 = {
    x: sc.speedMps * Math.cos(sc.gammaRad),
    y: 0,
    z: -sc.speedMps * Math.sin(sc.gammaRad),
  };
  // Nose along −v̂ (retrograde): body X in NED is (cosθ, 0, −sinθ) at φ=ψ=0,
  // and θ = π + γ gives (−cosγ, 0, sinγ) = −v̂ exactly.
  const q = qfromEuler321(0, Math.PI + sc.gammaRad, 0);
  return {
    r: { x: -sc.downrangeM, y: 0, z: -sc.altitudeM },
    v: rotateNEDtoBody(q, vNED),
    q,
    omega: { x: 0, y: 0, z: 0 },
    mass: cfg.mass.dryKg + sc.propellantKg,
  };
};

/** Result bundle: the run plus the phase-machine timestamps. */
export interface EntryDescentRunResult {
  result: RunResult;
  entryBurnIgnitionTime: number | null;
  entryBurnCutoffTime: number | null;
  landingIgnitionTime: number | null;
}

/**
 * Run the full entry → landing sequence with the constant-rating landing
 * engine (same thrust-curve swap as `runLandingSim` / plan A7).
 */
export const runEntryDescentSim = (
  cfg: RocketConfig,
  scenario: EntryScenario,
  opts: LandingRunOptions = {},
): EntryDescentRunResult => {
  const descent = cfg.control?.descent;
  if (!descent) {
    throw new Error('runEntryDescentSim: config has no "control.descent" section');
  }
  const maxTime = opts.maxTime ?? 600;
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
  const guidance = entryDescentGuidance(landingCfg);
  const initialState = initialEntryState(cfg, scenario);
  const result = runRocketSim(landingCfg, guidance, {
    ...opts,
    maxTime,
    initialState,
    groundConstraint: true,
  });
  attachLandingMetrics(result, cfg, initialState.mass, guidance.landingIgnitionTime);
  return {
    result,
    entryBurnIgnitionTime: guidance.entryBurnIgnitionTime,
    entryBurnCutoffTime: guidance.entryBurnCutoffTime,
    landingIgnitionTime: guidance.landingIgnitionTime,
  };
};
