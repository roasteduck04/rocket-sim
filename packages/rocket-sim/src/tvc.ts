/**
 * Thrust-vector control: gimbal actuator dynamics and the thrust force / moment
 * (README §4.4).
 *
 * Thrust deflected by pitch/yaw gimbal angles (δp, δy):
 * ```
 * F_thrust_body = T·[ cos δp·cos δy ;  sin δy ;  −sin δp·cos δy ]
 * M_thrust_body = r_gimbal_to_cg × F_thrust_body
 * ```
 * Following README §4.4 verbatim, `r_gimbal_to_cg` is the vector FROM the gimbal
 * TO the CG (`+X`, i.e. forward, length `x_gimbal − x_cg`). With the −sin δp
 * thrust component this makes `+δp` a NOSE-UP moment for the aft-mounted engine
 * (plan trap T4). The moment arm is recomputed from the INSTANTANEOUS CG every
 * call — never cached at t = 0 (trap T2).
 */

import type { Vec3 } from '@fds/physics-core';
import type { GimbalConfig } from './types.js';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Stateful gimbal actuator: clamps commands to ±δ_max and slew-rate limits the
 * change per step (README §4.4). Deterministic — the actuated angle depends only
 * on the previous angle, the command, and dt.
 */
export class GimbalActuator {
  private p = 0;
  private y = 0;

  constructor(private readonly cfg: GimbalConfig) {}

  /** Reset both channels to neutral. */
  reset(): void {
    this.p = 0;
    this.y = 0;
  }

  /** Advance the actuator by `dt` toward (cmdP, cmdY); returns the actuated angles. */
  update(cmdP: number, cmdY: number, dt: number): { deltaP: number; deltaY: number } {
    const lim = this.cfg.maxDeflectionRad;
    const maxStep = this.cfg.maxSlewRateRps * dt;
    const tgtP = clamp(cmdP, -lim, lim);
    const tgtY = clamp(cmdY, -lim, lim);
    this.p += clamp(tgtP - this.p, -maxStep, maxStep);
    this.y += clamp(tgtY - this.y, -maxStep, maxStep);
    return { deltaP: this.p, deltaY: this.y };
  }

  get deltaP(): number {
    return this.p;
  }
  get deltaY(): number {
    return this.y;
  }
}

/**
 * Thrust force (body) and moment (about the combined CG) for thrust magnitude
 * `T`, gimbal angles (δp, δy), and the instantaneous CG station `cgFromNose`.
 */
export const thrustForceMoment = (
  T: number,
  deltaP: number,
  deltaY: number,
  cgFromNose: number,
  gimbal: GimbalConfig,
): { F: Vec3; M: Vec3 } => {
  const cp = Math.cos(deltaP);
  const sp = Math.sin(deltaP);
  const cy = Math.cos(deltaY);
  const sy = Math.sin(deltaY);

  const F: Vec3 = { x: T * cp * cy, y: T * sy, z: -T * sp * cy };

  // r_gimbal_to_cg = (x_gimbal − x_cg, 0, 0) in body axes (+X, forward).
  const L = gimbal.positionFromNoseM - cgFromNose;
  const M: Vec3 = { x: 0, y: -L * F.z, z: L * F.y };
  return { F, M };
};
