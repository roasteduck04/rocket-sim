/**
 * Guidance modes (README §4.6). Phases 2–3 implement modes 1–2:
 *
 * 1. **Open-loop ascent** — vertical rise, a brief pitch-over "kick" (a
 *    commanded gimbal deflection over a configured window) to tip the vehicle
 *    off vertical, then zero commanded gimbal so the aerodynamically-stable
 *    vehicle weathervanes into the relative wind and follows a gravity turn.
 *    No feedback.
 * 2. **Attitude-hold** — the cascaded PID `AttitudeController` tracks a
 *    commanded attitude profile θ_cmd(t)/ψ_cmd(t), validating the control loop
 *    in isolation (README §10.2.3). Powered descent is Phase 4.
 */

import { AttitudeController } from './control/attitudeControl.js';
import type { AttitudeCommand } from './control/attitudeControl.js';
import type { GimbalCommand, RocketConfig, RocketState } from './types.js';

/** A guidance law: maps time and state to a gimbal + throttle command. */
export interface GuidanceMode {
  command(t: number, s: RocketState): GimbalCommand;
}

/**
 * Open-loop gravity-turn ascent (README §4.6 mode 1). Full throttle throughout
 * (the sim cuts thrust automatically at propellant exhaustion); the pitch-over
 * kick applies `kickDeflectionRad` on the pitch gimbal over
 * `[kickStartS, kickStartS + kickDurationS)`, and zero gimbal otherwise.
 */
export const openLoopAscent = (cfg: RocketConfig): GuidanceMode => {
  const { kickStartS, kickDurationS, kickDeflectionRad } = cfg.guidance;
  const kickEnd = kickStartS + kickDurationS;
  return {
    command(t: number): GimbalCommand {
      const inKick = t >= kickStartS && t < kickEnd;
      return {
        deltaP: inKick ? kickDeflectionRad : 0,
        deltaY: 0,
        throttle: 1,
      };
    },
  };
};

/** Commanded attitude (+ optional throttle, default 1) at time `t`. */
export type AttitudeProfile = (t: number) => AttitudeCommand & { throttle?: number };

/**
 * Attitude-hold guidance (README §4.6 mode 2): PID-track a commanded attitude
 * profile. Gains and limits come from `cfg.control` / `cfg.propulsion.gimbal`.
 *
 * Stateful and deterministic: the controller's dt is inferred from successive
 * `command` calls (the run driver calls guidance exactly once per fixed step),
 * with dt = 0 on the first call — pure proportional + rate action until time
 * advances. The returned δp/δy are already actuator-shaped (clamp + slew), so
 * the run driver's own `GimbalActuator` tracks them exactly (its per-step
 * change never exceeds the shared slew limit) — the limits apply once, not
 * twice.
 */
export const attitudeHold = (cfg: RocketConfig, profile: AttitudeProfile): GuidanceMode => {
  if (!cfg.control) {
    throw new Error('attitudeHold: config has no "control" section (README §8.1)');
  }
  const controller = new AttitudeController(cfg.control, cfg.propulsion.gimbal);
  let lastT: number | null = null;
  return {
    command(t: number, s: RocketState): GimbalCommand {
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      const cmd = profile(t);
      const act = controller.update(cmd, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle: cmd.throttle ?? 1 };
    },
  };
};
