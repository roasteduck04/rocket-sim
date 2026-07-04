/**
 * Unit-quaternion attitude kinematics and rotations (README §3.1).
 *
 * Scalar-first convention: `q = [q0, q1, q2, q3]`, `‖q‖ = 1`, with `q0` the
 * scalar part. The quaternion encodes vehicle attitude such that:
 *   - `qtoDCM(q)` is the NED→body direction cosine matrix (`v_body = C·v_ned`);
 *   - the body-rate kinematics are `q̇ = ½·Ω(ω)·q` exactly as written in §3.1.
 *
 * See `docs/equations.md` for the full derivation and the proof that the Ω-matrix
 * form equals the Hamilton product `½·q ⊗ [0, ω]`.
 */

import type { Vec3 } from './vec3.js';
import { m3vec, m3transpose, type Mat3 } from './mat3.js';

export type Quat = [number, number, number, number];

export const qidentity = (): Quat => [1, 0, 0, 0];

/** Hamilton product a ⊗ b. */
export const qmul = (a: Quat, b: Quat): Quat => {
  const [a0, a1, a2, a3] = a;
  const [b0, b1, b2, b3] = b;
  return [
    a0 * b0 - a1 * b1 - a2 * b2 - a3 * b3,
    a0 * b1 + a1 * b0 + a2 * b3 - a3 * b2,
    a0 * b2 - a1 * b3 + a2 * b0 + a3 * b1,
    a0 * b3 + a1 * b2 - a2 * b1 + a3 * b0,
  ];
};

export const qconj = (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]];

export const qnorm = (q: Quat): number =>
  Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);

export const qnormalize = (q: Quat): Quat => {
  const n = qnorm(q);
  if (n === 0) return qidentity();
  const s = 1 / n;
  return [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
};

/**
 * Attitude kinematics: q̇ = ½·Ω(ω)·q, with ω the BODY-frame angular rate.
 *
 * Written out from the README §3.1 Ω(ω) matrix directly, so it visibly matches
 * the spec. Algebraically identical to ½·(q ⊗ [0, ωx, ωy, ωz]).
 */
export const qderiv = (q: Quat, omega: Vec3): Quat => {
  const [q0, q1, q2, q3] = q;
  const p = omega.x;
  const qy = omega.y;
  const r = omega.z;
  return [
    0.5 * (-p * q1 - qy * q2 - r * q3),
    0.5 * (p * q0 + r * q2 - qy * q3),
    0.5 * (qy * q0 - r * q1 + p * q3),
    0.5 * (r * q0 + qy * q1 - p * q2),
  ];
};

/**
 * Quaternion from a 3-2-1 (yaw ψ → pitch θ → roll φ) Euler sequence, angles in
 * radians. Consistent with `qtoDCM` so that
 * `qtoDCM(qfromEuler321(φ,θ,ψ)) = Rx(φ)·Ry(θ)·Rz(ψ)`.
 */
export const qfromEuler321 = (phi: number, theta: number, psi: number): Quat => {
  const cphi = Math.cos(phi / 2);
  const sphi = Math.sin(phi / 2);
  const cth = Math.cos(theta / 2);
  const sth = Math.sin(theta / 2);
  const cpsi = Math.cos(psi / 2);
  const spsi = Math.sin(psi / 2);
  return [
    cphi * cth * cpsi + sphi * sth * spsi,
    sphi * cth * cpsi - cphi * sth * spsi,
    cphi * sth * cpsi + sphi * cth * spsi,
    cphi * cth * spsi - sphi * sth * cpsi,
  ];
};

export interface Euler321 {
  /** roll, rad */
  phi: number;
  /** pitch, rad (clamped to ±π/2 at the gimbal singularity) */
  theta: number;
  /** yaw, rad */
  psi: number;
}

/** Extract 3-2-1 Euler angles from a (unit) quaternion. */
export const qtoEuler321 = (q: Quat): Euler321 => {
  const [q0, q1, q2, q3] = q;
  const sinTheta = Math.max(-1, Math.min(1, 2 * (q0 * q2 - q1 * q3)));
  return {
    phi: Math.atan2(2 * (q2 * q3 + q0 * q1), q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3),
    theta: Math.asin(sinTheta),
    psi: Math.atan2(2 * (q1 * q2 + q0 * q3), q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3),
  };
};

/** NED→body direction cosine matrix C_{b/n} (v_body = C·v_ned). */
export const qtoDCM = (q: Quat): Mat3 => {
  const [q0, q1, q2, q3] = q;
  const q0q0 = q0 * q0;
  const q1q1 = q1 * q1;
  const q2q2 = q2 * q2;
  const q3q3 = q3 * q3;
  return [
    q0q0 + q1q1 - q2q2 - q3q3, 2 * (q1 * q2 + q0 * q3), 2 * (q1 * q3 - q0 * q2),
    2 * (q1 * q2 - q0 * q3), q0q0 - q1q1 + q2q2 - q3q3, 2 * (q2 * q3 + q0 * q1),
    2 * (q1 * q3 + q0 * q2), 2 * (q2 * q3 - q0 * q1), q0q0 - q1q1 - q2q2 + q3q3,
  ];
};

/** Rotate an NED vector into the body frame. */
export const rotateNEDtoBody = (q: Quat, v: Vec3): Vec3 => m3vec(qtoDCM(q), v);

/** Rotate a body-frame vector into NED. */
export const rotateBodyToNED = (q: Quat, v: Vec3): Vec3 =>
  m3vec(m3transpose(qtoDCM(q)), v);
