/**
 * Rocket state (de)serialization (README §4.1).
 *
 * The integrator operates on a flat 14-element `Float64Array`; this module packs
 * the object-form `RocketState` into that layout and back:
 *
 * ```
 * index: 0  1  2   3  4  5   6  7  8  9    10 11 12   13
 * field: rx ry rz  u  v  w   q0 q1 q2 q3   p  q  r    m
 *        └ r_NED ┘ └ v_body┘ └── quat ──┘ └ ω_body┘  mass
 * ```
 */

import { qnormalize, type Quat } from '@fds/physics-core';
import type { RocketState } from './types.js';

/** Number of scalar state variables (README §4.1). */
export const STATE_SIZE = 14;

// Layout offsets.
export const IDX_R = 0;
export const IDX_V = 3;
export const IDX_Q = 6;
export const IDX_OMEGA = 10;
export const IDX_M = 13;

/** Pack object-form state into a flat 14-element array. */
export const packState = (s: RocketState): Float64Array => {
  const x = new Float64Array(STATE_SIZE);
  x[0] = s.r.x;
  x[1] = s.r.y;
  x[2] = s.r.z;
  x[3] = s.v.x;
  x[4] = s.v.y;
  x[5] = s.v.z;
  x[6] = s.q[0];
  x[7] = s.q[1];
  x[8] = s.q[2];
  x[9] = s.q[3];
  x[10] = s.omega.x;
  x[11] = s.omega.y;
  x[12] = s.omega.z;
  x[13] = s.mass;
  return x;
};

/** Unpack a flat state array into object form. */
export const unpackState = (x: Float64Array): RocketState => ({
  r: { x: x[0], y: x[1], z: x[2] },
  v: { x: x[3], y: x[4], z: x[5] },
  q: [x[6], x[7], x[8], x[9]],
  omega: { x: x[10], y: x[11], z: x[12] },
  mass: x[13],
});

/** Read the quaternion sub-vector. */
export const quatOf = (x: Float64Array): Quat => [x[6], x[7], x[8], x[9]];

/**
 * Renormalize the quaternion sub-vector in place to unit length. Called once per
 * accepted step in the sim loop to bound integration drift (README §10.1).
 * Returns the same array for convenience.
 */
export const renormalizeQuat = (x: Float64Array): Float64Array => {
  const [q0, q1, q2, q3] = qnormalize([x[6], x[7], x[8], x[9]]);
  x[6] = q0;
  x[7] = q1;
  x[8] = q2;
  x[9] = q3;
  return x;
};
