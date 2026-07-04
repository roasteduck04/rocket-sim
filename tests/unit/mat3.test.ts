import { describe, it, expect } from 'vitest';
import {
  vec3,
  m3identity,
  m3diag,
  m3vec,
  m3mul,
  m3transpose,
  m3det,
  m3inv,
  type Mat3,
} from '@fds/physics-core';

const expectMatClose = (a: Mat3, b: Mat3, digits = 9): void => {
  for (let i = 0; i < 9; i++) expect(a[i]).toBeCloseTo(b[i], digits);
};

describe('mat3 algebra', () => {
  const A: Mat3 = [1, 2, 3, 0, 1, 4, 5, 6, 0];

  it('matrix–vector product matches hand calculation', () => {
    const v = m3vec(A, vec3(1, 1, 1));
    expect(v.x).toBeCloseTo(6, 12);
    expect(v.y).toBeCloseTo(5, 12);
    expect(v.z).toBeCloseTo(11, 12);
  });

  it('identity is a multiplicative unit', () => {
    expectMatClose(m3mul(A, m3identity()), A);
    expectMatClose(m3mul(m3identity(), A), A);
  });

  it('double transpose is the identity operation', () => {
    expectMatClose(m3transpose(m3transpose(A)), A);
  });

  it('(A·B)ᵀ = Bᵀ·Aᵀ', () => {
    const B: Mat3 = [2, 0, 1, 1, 3, 2, 4, 1, 0];
    expectMatClose(m3transpose(m3mul(A, B)), m3mul(m3transpose(B), m3transpose(A)));
  });

  it('inverse satisfies A·A⁻¹ = I', () => {
    // det(A) = 1·(1·0−4·6) − 2·(0·0−4·5) + 3·(0·6−1·5) = −24 + 40 − 15 = 1
    expect(m3det(A)).toBeCloseTo(1, 12);
    const inv = m3inv(A);
    expectMatClose(m3mul(A, inv), m3identity());
    expectMatClose(m3mul(inv, A), m3identity());
  });

  it('m3inv throws on a singular matrix', () => {
    const singular: Mat3 = [1, 2, 3, 2, 4, 6, 0, 0, 1]; // rows 1,2 collinear
    expect(() => m3inv(singular)).toThrow();
  });

  it('diagonal matrix scales each axis (inertia-tensor use)', () => {
    const I = m3diag(2, 5, 9);
    const w = m3vec(I, vec3(1, 1, 1));
    expect(w.x).toBeCloseTo(2, 12);
    expect(w.y).toBeCloseTo(5, 12);
    expect(w.z).toBeCloseTo(9, 12);
  });
});
