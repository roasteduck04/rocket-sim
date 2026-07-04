/**
 * Cascaded PID attitude controller for TVC gimbal stabilization (README §4.6).
 *
 * Per channel (pitch shown; yaw is the same structure with ψ, r, δy):
 * ```
 * θ_err  = θ_cmd − θ_actual                        (wrapped to (−π, π])
 * δp_cmd = Kp·θ_err + Ki·∫θ_err dt + Kd·(−q)        (rate feedback as derivative)
 * δp     = rateLimit(clamp(δp_cmd, ±δ_max), δ̇_max, dt)   (GimbalActuator)
 * ```
 * Sign closure (negative feedback, both channels — see docs/equations.md
 * Phase 3): with the suite's §4.4-verbatim moment arm, +δp → nose-up (+M_y)
 * and +δy → nose-right (+M_z), so a positive attitude error commands a moment
 * that reduces it, and Kd·(−q) opposes the rate.
 *
 * θ/ψ come from the Euler-321 decomposition of the attitude quaternion, so the
 * error is singular at θ = ±90° (gimbal lock) — hold attitudes away from
 * exactly vertical (the open-loop vertical-rise phase needs no feedback).
 *
 * Roll: no gimbal authority on a single-engine vehicle — config-toggle stub
 * (README §4.6); enabling it is rejected until an RCS/fin model exists.
 *
 * All gains and limits come from `ControlConfig`/`GimbalConfig` — nothing is
 * hardcoded (README §4.6).
 */

import { qtoEuler321, rotateNEDtoBody, vnormalize, type Vec3 } from '@fds/physics-core';
import { Pid } from './pid.js';
import { GimbalActuator } from '../tvc.js';
import type { ControlConfig, GimbalConfig, RocketState } from '../types.js';

/** Commanded attitude, rad (Euler-321 pitch/yaw of the NED→body quaternion). */
export interface AttitudeCommand {
  theta: number;
  psi: number;
}

/** Wrap an angle to (−π, π] so errors take the short way around. */
export const wrapPi = (a: number): number => {
  const w = a % (2 * Math.PI);
  if (w > Math.PI) return w - 2 * Math.PI;
  if (w <= -Math.PI) return w + 2 * Math.PI;
  return w;
};

export class AttitudeController {
  private readonly pitchPid: Pid;
  private readonly yawPid: Pid;
  private readonly actuator: GimbalActuator;

  constructor(control: ControlConfig, gimbal: GimbalConfig) {
    if (control.rollControlEnabled) {
      throw new Error(
        'attitude control: roll channel is a stub — the MVP vehicle has no roll gimbal authority (README §4.6)',
      );
    }
    // Integral anti-windup capped at full actuator authority.
    const integralLimit = gimbal.maxDeflectionRad;
    this.pitchPid = new Pid(control.pidPitch, { integralLimit });
    this.yawPid = new Pid(control.pidYaw, { integralLimit });
    this.actuator = new GimbalActuator(gimbal);
  }

  /** Clear PID integrals and re-center the actuator. */
  reset(): void {
    this.pitchPid.reset();
    this.yawPid.reset();
    this.actuator.reset();
  }

  /**
   * One control-loop step: attitude error → PID → actuator. Returns the
   * ACTUATED gimbal angles (already clamped and slew-limited), ready to use as
   * the gimbal command for this timestep.
   */
  update(cmd: AttitudeCommand, s: RocketState, dt: number): { deltaP: number; deltaY: number } {
    const euler = qtoEuler321(s.q);
    const thetaErr = wrapPi(cmd.theta - euler.theta);
    const psiErr = wrapPi(cmd.psi - euler.psi);
    // Derivative on measurement: −q, −r (README §4.6).
    const dpCmd = this.pitchPid.update(thetaErr, -s.omega.y, dt);
    const dyCmd = this.yawPid.update(psiErr, -s.omega.z, dt);
    return this.actuator.update(dpCmd, dyCmd, dt);
  }

  /**
   * Direction-vector variant for near-vertical flight (Phase 4): the Euler
   * errors above are singular at θ = ±90°, but a landing burn is flown
   * nose-up, so the command is the desired nose (+X) direction in NED and the
   * pointing errors are formed directly in body axes:
   * ```
   * b  = R(q)·d̂_NED                (commanded direction, body axes)
   * eP = atan2(−b_z, b_x)           (rotation about +Y_body toward b)
   * eY = atan2(+b_y, b_x)           (rotation about +Z_body toward b)
   * ```
   * At small tilts from a horizontal reference this reduces exactly to the
   * Euler errors, and the same PIDs (rate feedback −q, −r) and actuator apply,
   * so the Phase-3 sign closure carries over unchanged.
   */
  updateDirection(dirNED: Vec3, s: RocketState, dt: number): { deltaP: number; deltaY: number } {
    const b = rotateNEDtoBody(s.q, vnormalize(dirNED));
    const pitchErr = Math.atan2(-b.z, b.x);
    const yawErr = Math.atan2(b.y, b.x);
    const dpCmd = this.pitchPid.update(pitchErr, -s.omega.y, dt);
    const dyCmd = this.yawPid.update(yawErr, -s.omega.z, dt);
    return this.actuator.update(dpCmd, dyCmd, dt);
  }
}
