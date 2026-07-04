import { describe, it, expect } from 'vitest';
import {
  vec3,
  vzero,
  vadd,
  vsub,
  vscale,
  vneg,
  vdot,
  vcross,
  vnorm,
  vnormalize,
  type Vec3,
} from '@fds/physics-core';

const expectVecClose = (a: Vec3, b: Vec3, tol = 1e-12): void => {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
  expect(a.z).toBeCloseTo(b.z, 10);
  void tol;
};

describe('vec3 algebra', () => {
  const a = vec3(1, 2, 3);
  const b = vec3(-4, 5, 6);

  it('adds and subtracts componentwise', () => {
    expectVecClose(vadd(a, b), vec3(-3, 7, 9));
    expectVecClose(vsub(a, b), vec3(5, -3, -3));
    expectVecClose(vadd(a, vneg(a)), vzero());
  });

  it('scales and negates', () => {
    expectVecClose(vscale(a, 2), vec3(2, 4, 6));
    expectVecClose(vneg(a), vscale(a, -1));
  });

  it('dot product is symmetric and detects orthogonality', () => {
    expect(vdot(a, b)).toBeCloseTo(vdot(b, a), 12);
    expect(vdot(a, b)).toBeCloseTo(1 * -4 + 2 * 5 + 3 * 6, 12);
    expect(vdot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
  });

  it('cross product anticommutes and a×a = 0', () => {
    expectVecClose(vcross(a, b), vneg(vcross(b, a)));
    expectVecClose(vcross(a, a), vzero());
    // right-handed basis: e1 × e2 = e3
    expectVecClose(vcross(vec3(1, 0, 0), vec3(0, 1, 0)), vec3(0, 0, 1));
  });

  it('scalar triple product equals the 3×3 determinant', () => {
    const c = vec3(7, -1, 2);
    const triple = vdot(a, vcross(b, c));
    const det =
      a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x);
    expect(triple).toBeCloseTo(det, 10);
  });

  it('norm and normalization', () => {
    expect(vnorm(vec3(3, 4, 0))).toBeCloseTo(5, 12);
    expect(vnorm(vnormalize(a))).toBeCloseTo(1, 12);
    // zero vector normalizes to zero rather than NaN
    expectVecClose(vnormalize(vzero()), vzero());
  });
});
