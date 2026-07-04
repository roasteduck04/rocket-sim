/**
 * Powered-descent / landing-burn guidance (README §4.6 mode 3, plan Phase 4).
 *
 * A simple suicide-burn law with a cascaded structure (see docs/equations.md
 * Phase 4 for the derivation and sign closure):
 *
 * 1. **Coast** — engine off (throttle 0). With zero thrust the TVC gimbal has
 *    no control authority, so the commanded gimbal is 0 as well.
 * 2. **Ignition trigger** — light the engine when
 *    `h ≤ v²/(2·a_max)·(1 + margin)`, with `v` the descent rate and
 *    `a_max = T_max/m − g` the instantaneous full-throttle deceleration.
 *    Latched: once lit the engine stays lit (a real landing burn does not
 *    stutter), and the design deceleration `a_d = a_max(t_ign)/(1 + margin)`
 *    is frozen at ignition so the commanded profile is a fixed curve.
 * 3. **Vertical channel** — track the constant-deceleration profile
 *    `v_cmd(h) = −√(v_td² + 2·a_d·h)` (which passes through the ignition
 *    point by construction and reaches `v_td` exactly at h = 0) with
 *    `throttle = m·(g + a_d·clamp(ḣ/v_cmd, 0, 1.5))/T_rated + PID(v_cmd − ḣ)`,
 *    clamped to the config throttle band. The first term is the hover +
 *    profile-deceleration feedforward; the PID trims the residual.
 * 4. **Horizontal channel** — per-axis position PIDs (derivative on the
 *    measured NED velocity) command a small thrust-axis tilt, bounded by
 *    `maxTiltRad`; the tilted nose direction feeds the non-singular
 *    direction-vector attitude controller, which closes the loop through the
 *    shared gimbal actuator (README §4.6 cascade).
 *
 * All parameters come from `control.descent` / `control.landing_target` /
 * `propulsion.throttle` — nothing is hardcoded (README §4.6). Deterministic:
 * dt is inferred from successive `command` calls exactly like `attitudeHold`
 * (dt = 0 on the first call).
 */

import { gravityAtAltitude, rotateBodyToNED, vnormalize } from '@fds/physics-core';
import { AttitudeController } from '../control/attitudeControl.js';
import { Pid } from '../control/pid.js';
import type { GuidanceMode } from '../guidance.js';
import type { GimbalCommand, LandingTarget, RocketConfig, RocketState } from '../types.js';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Powered-descent guidance with its ignition state exposed for telemetry/tests. */
export interface DescentGuidance extends GuidanceMode {
  /** Suicide-burn ignition time, s; `null` while still coasting. */
  readonly ignitionTime: number | null;
}

/**
 * Build the powered-descent guidance law for a config with a
 * `control.descent` section (README §8.1 + plan A7). The landing target
 * defaults to the NED origin with the §8.1 2 m/s touchdown limit.
 */
export const poweredDescentGuidance = (cfg: RocketConfig): DescentGuidance => {
  const control = cfg.control;
  const descent = control?.descent;
  if (!control || !descent) {
    throw new Error(
      'poweredDescentGuidance: config has no "control.descent" section (README §4.6 mode 3)',
    );
  }
  const target: LandingTarget = control.landingTarget ?? {
    northM: 0,
    eastM: 0,
    touchdownVzMaxMps: 2.0,
  };
  const { min: thrMin, max: thrMax } = cfg.propulsion.throttle;
  const { ratedThrustN, ignitionMargin, touchdownSpeedMps, maxTiltRad, pidVz, pidPos } = descent;

  const attitude = new AttitudeController(control, cfg.propulsion.gimbal);
  // Anti-windup caps: the vz integral alone can never demand more than full
  // throttle; each position integral no more than the full tilt authority.
  const vzPid = new Pid(pidVz, { integralLimit: thrMax });
  const tanTiltMax = Math.tan(maxTiltRad);
  const posNorthPid = new Pid(pidPos, { integralLimit: tanTiltMax });
  const posEastPid = new Pid(pidPos, { integralLimit: tanTiltMax });

  let lastT: number | null = null;
  let ignitionTime: number | null = null;
  let designDecel = 0; // a_d, frozen at ignition

  return {
    get ignitionTime(): number | null {
      return ignitionTime;
    },

    command(t: number, s: RocketState): GimbalCommand {
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;

      const h = -s.r.z;
      const vNED = rotateBodyToNED(s.q, s.v);
      const climbRate = -vNED.z; // < 0 while descending
      const g = gravityAtAltitude(Math.max(0, h));
      const aMax = (ratedThrustN * thrMax) / s.mass - g;

      if (ignitionTime === null) {
        const descentRate = Math.max(0, -climbRate);
        // Can't decelerate at all (T_max < weight) → best effort: ignite now.
        const hIgnite =
          aMax > 0 ? ((descentRate * descentRate) / (2 * aMax)) * (1 + ignitionMargin) : Infinity;
        if (descentRate > 0 && h <= hIgnite) {
          ignitionTime = t;
          designDecel = aMax > 0 ? aMax / (1 + ignitionMargin) : 0;
        } else {
          return { deltaP: 0, deltaY: 0, throttle: 0 }; // coast, engine off
        }
      }

      // --- Vertical channel: profile tracking → throttle ---
      const vCmd = -Math.sqrt(
        touchdownSpeedMps * touchdownSpeedMps + 2 * designDecel * Math.max(0, h),
      );
      // On-profile deceleration feedforward: v̇_cmd = a_d·(ḣ/v_cmd) — equals
      // a_d when tracking; clamped for far-off-profile states.
      const ffAccel = designDecel * clamp(climbRate / vCmd, 0, 1.5);
      const ffThrottle = (s.mass * (g + ffAccel)) / ratedThrustN;
      const vzErr = vCmd - climbRate; // > 0 → falling too fast → more thrust
      const throttle = clamp(ffThrottle + vzPid.update(vzErr, 0, dt), thrMin, thrMax);

      // --- Horizontal channel: position PIDs → bounded tilt → gimbal ---
      let tiltN = posNorthPid.update(target.northM - s.r.x, -vNED.x, dt);
      let tiltE = posEastPid.update(target.eastM - s.r.y, -vNED.y, dt);
      const tilt = Math.hypot(tiltN, tiltE);
      if (tilt > tanTiltMax) {
        tiltN *= tanTiltMax / tilt;
        tiltE *= tanTiltMax / tilt;
      }
      // Desired nose (+X) direction: mostly up, tilted toward the target.
      const dir = vnormalize({ x: tiltN, y: tiltE, z: -1 });
      const act = attitude.updateDirection(dir, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle };
    },
  };
};
