/**
 * 3×3 matrix algebra (row-major), for inertia tensors and rotation matrices.
 *
 * Layout: `[m00, m01, m02,  m10, m11, m12,  m20, m21, m22]`
 * (row-major), so `M[row*3 + col]`.
 */

import type { Vec3 } from './vec3.js';

export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const m3identity = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Diagonal matrix diag(dx, dy, dz) — e.g. a principal-axis inertia tensor. */
export const m3diag = (dx: number, dy: number, dz: number): Mat3 => [
  dx, 0, 0,
  0, dy, 0,
  0, 0, dz,
];

/** Matrix–vector product M·v. */
export const m3vec = (m: Mat3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

/** Matrix product A·B. */
export const m3mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

  a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

  a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
  a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

export const m3transpose = (m: Mat3): Mat3 => [
  m[0], m[3], m[6],
  m[1], m[4], m[7],
  m[2], m[5], m[8],
];

export const m3det = (m: Mat3): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) -
  m[1] * (m[3] * m[8] - m[5] * m[6]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);

/** Matrix inverse via cofactors. Throws if the matrix is singular. */
export const m3inv = (m: Mat3): Mat3 => {
  const det = m3det(m);
  if (det === 0 || !Number.isFinite(det)) {
    throw new Error('m3inv: matrix is singular or non-finite');
  }
  const invDet = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * invDet,
    (m[2] * m[7] - m[1] * m[8]) * invDet,
    (m[1] * m[5] - m[2] * m[4]) * invDet,

    (m[5] * m[6] - m[3] * m[8]) * invDet,
    (m[0] * m[8] - m[2] * m[6]) * invDet,
    (m[2] * m[3] - m[0] * m[5]) * invDet,

    (m[3] * m[7] - m[4] * m[6]) * invDet,
    (m[1] * m[6] - m[0] * m[7]) * invDet,
    (m[0] * m[4] - m[1] * m[3]) * invDet,
  ];
};
