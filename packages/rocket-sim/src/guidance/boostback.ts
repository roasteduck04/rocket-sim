/**
 * Boostback scenario (Phase 7; plan A8 — "boostback = Phase 7 stretch").
 *
 * Flies the full Falcon-style return sequence in one guidance state machine:
 *
 *  1. **boostback** — full-throttle burn with the thrust axis held HORIZONTAL
 *     along the VELOCITY-TO-BE-GAINED vector (classic v_go guidance): with
 *     the vacuum-ballistic time-to-ground
 *       t_go: r_z + v_z·t + g·t²/2 = 0  (positive root)
 *     the horizontal velocity that arrives over the pad AT TOUCHDOWN is
 *       v_des = (target − r_horizontal)/t_eff,    v_go = v_des − v_horizontal
 *     and the burn thrusts along v_go until ‖v_go‖ < `cutoffMps`. Two details
 *     make this robust where naive impact-point targeting overshoots by
 *     hundreds of metres:
 *      - ‖v_go‖ shrinks monotonically under thrust along it, so the cutoff
 *        is insensitive to t_go shrinking as the vehicle falls;
 *      - t_eff = t_go + v_impact/(2·a_d) extends the ballistic time-to-ground
 *        by the suicide burn's flight-time extension (braking from v_impact
 *        at the design deceleration a_d = a_max/(1+margin) covers the same
 *        distance in about twice the ballistic time), so the horizontal
 *        drift during the landing burn is priced into the aim.
 *  2. **flip** — minimum-throttle attitude reversal to nose-up (the gimbal
 *     needs thrust for control authority; a free-tumbling flip would be
 *     uncontrolled). Ends when the nose is within `flipToleranceRad` of up.
 *  3. **descent** — delegate to the Phase-4 suicide-burn guidance, which
 *     coasts engine-off to its own ignition altitude and lands. (The convex
 *     PDG in `pdg.ts` plans a continuous burn, so the fuel-optimal coast is
 *     exactly what the classic trigger provides here; see docs/equations.md
 *     Phase 7 for the trade.)
 *
 * All vehicle parameters come from the §8.1 config; nothing is hardcoded.
 */

import { G0, rotateBodyToNED, vnormalize, type Vec3 } from '@fds/physics-core';
import { AttitudeController } from '../control/attitudeControl.js';
import type { GuidanceMode } from '../guidance.js';
import type { GimbalCommand, RocketConfig, RocketState } from '../types.js';
import { poweredDescentGuidance } from './landing.js';
import {
  attachLandingMetrics,
  initialDescentState,
  runRocketSim,
  type LandingRunOptions,
  type LandingScenario,
  type RunResult,
} from '../sim.js';

export type BoostbackPhase = 'boostback' | 'flip' | 'descent';

export interface BoostbackOptions {
  /** Velocity-to-be-gained cutoff for the boostback burn, m/s (default 2). */
  cutoffMps?: number;
  /** Nose-up cone that ends the flip, rad (default 0.26 ≈ 15°). */
  flipToleranceRad?: number;
}

/** Boostback guidance with its phase machine exposed for telemetry/tests. */
export interface BoostbackGuidance extends GuidanceMode {
  readonly phase: BoostbackPhase;
  /** Boostback engine-cut time, s (null while still burning back). */
  readonly boostbackCutoffTime: number | null;
  /** Landing-burn ignition time from the delegated Phase-4 guidance. */
  readonly landingIgnitionTime: number | null;
}

/** Vacuum-ballistic time-to-ground and impact prediction (NED, plane z = 0). */
export const predictImpact = (
  r: Vec3,
  vNED: Vec3,
): { north: number; east: number; tGo: number } => {
  // z(t) = r_z + v_z·t + g·t²/2 = 0, +z down; the positive root is time-to-ground.
  const g = G0;
  const disc = vNED.z * vNED.z - 2 * g * r.z;
  const tGo = (-vNED.z + Math.sqrt(Math.max(0, disc))) / g;
  return { north: r.x + vNED.x * tGo, east: r.y + vNED.y * tGo, tGo };
};

/** Build the boostback → flip → descent guidance (see module header). */
export const boostbackGuidance = (
  cfg: RocketConfig,
  opts: BoostbackOptions = {},
): BoostbackGuidance => {
  const control = cfg.control;
  if (!control?.descent) {
    throw new Error('boostbackGuidance: config has no "control.descent" section (README §8.1)');
  }
  const target = control.landingTarget ?? { northM: 0, eastM: 0, touchdownVzMaxMps: 2.0 };
  const cutoffMps = opts.cutoffMps ?? 2;
  const flipTol = opts.flipToleranceRad ?? 0.26;
  const { min: thrMin, max: thrMax } = cfg.propulsion.throttle;

  const attitude = new AttitudeController(control, cfg.propulsion.gimbal);
  const landing = poweredDescentGuidance(cfg);

  let phase: BoostbackPhase = 'boostback';
  let cutoffTime: number | null = null;
  let lastT: number | null = null;

  return {
    get phase(): BoostbackPhase {
      return phase;
    },
    get boostbackCutoffTime(): number | null {
      return cutoffTime;
    },
    get landingIgnitionTime(): number | null {
      return landing.ignitionTime;
    },

    command(t: number, s: RocketState): GimbalCommand {
      if (phase === 'descent') return landing.command(t, s);

      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      const vNED = rotateBodyToNED(s.q, s.v);

      if (phase === 'boostback') {
        const { tGo } = predictImpact(s.r, vNED);
        // Effective time until touchdown: ballistic fall + landing-burn
        // extension (see module header).
        const vImpact = Math.sqrt(Math.max(0, vNED.z * vNED.z - 2 * G0 * s.r.z));
        const aMax = (control.descent!.ratedThrustN * thrMax) / s.mass - G0;
        const aD = aMax > 0 ? aMax / (1 + control.descent!.ignitionMargin) : 0;
        const tEff = tGo + (aD > 0 ? vImpact / (2 * aD) : 0);
        // Velocity-to-be-gained toward arriving over the pad at touchdown.
        const vGoN = (target.northM - s.r.x) / tEff - vNED.x;
        const vGoE = (target.eastM - s.r.y) / tEff - vNED.y;
        const vGo = Math.hypot(vGoN, vGoE);
        if (vGo < cutoffMps || tGo <= 1e-6) {
          phase = 'flip';
          cutoffTime = t;
        } else {
          // Thrust axis horizontal along v_go (see module header).
          const dir = vnormalize({ x: vGoN, y: vGoE, z: 0 });
          const act = attitude.updateDirection(dir, s, dt);
          return { deltaP: act.deltaP, deltaY: act.deltaY, throttle: thrMax };
        }
      }

      // Flip: minimum throttle for gimbal authority, nose to straight up.
      const noseNED = rotateBodyToNED(s.q, { x: 1, y: 0, z: 0 });
      if (-noseNED.z > Math.cos(flipTol)) {
        phase = 'descent';
        return landing.command(t, s);
      }
      const act = attitude.updateDirection({ x: 0, y: 0, z: -1 }, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle: thrMin };
    },
  };
};

/** Initial condition for a boostback run: post-staging, moving away from the pad. */
export interface BoostbackScenario extends LandingScenario {
  /** Climb rate at staging, m/s (+ up; overrides descentRateMps if given). */
  climbRateMps?: number;
}

/** Result bundle: the run plus the phase-machine timestamps. */
export interface BoostbackRunResult {
  result: RunResult;
  boostbackCutoffTime: number | null;
  landingIgnitionTime: number | null;
}

/**
 * Run the full boostback → flip → coast → landing-burn sequence with the
 * constant-rating landing engine (plan A7, same swap as `runLandingSim`).
 */
export const runBoostbackLandingSim = (
  cfg: RocketConfig,
  scenario: BoostbackScenario,
  opts: LandingRunOptions & { boostback?: BoostbackOptions } = {},
): BoostbackRunResult => {
  const descent = cfg.control?.descent;
  if (!descent) {
    throw new Error('runBoostbackLandingSim: config has no "control.descent" section');
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

  const effective: LandingScenario = {
    ...scenario,
    descentRateMps:
      scenario.climbRateMps !== undefined ? -scenario.climbRateMps : scenario.descentRateMps,
  };
  const guidance = boostbackGuidance(landingCfg, opts.boostback);
  const initialState = initialDescentState(cfg, effective);
  const result = runRocketSim(landingCfg, guidance, {
    ...opts,
    maxTime,
    initialState,
    groundConstraint: true,
  });
  attachLandingMetrics(result, cfg, initialState.mass, guidance.landingIgnitionTime);
  return {
    result,
    boostbackCutoffTime: guidance.boostbackCutoffTime,
    landingIgnitionTime: guidance.landingIgnitionTime,
  };
};
