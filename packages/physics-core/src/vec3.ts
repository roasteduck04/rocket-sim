/** 3-vector algebra. Immutable value type `{ x, y, z }`. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const vzero = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export const vadd = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const vsub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const vscale = (a: Vec3, s: number): Vec3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});

export const vneg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });

export const vdot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

export const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Euclidean norm ‖a‖. */
export const vnorm = (a: Vec3): number => Math.sqrt(vdot(a, a));

/**
 * Unit vector in the direction of `a`. A zero vector is returned unchanged
 * (norm 0) rather than producing NaN.
 */
export const vnormalize = (a: Vec3): Vec3 => {
  const n = vnorm(a);
  return n === 0 ? vzero() : vscale(a, 1 / n);
};
