import { describe, it, expect } from 'vitest';
import {
  qidentity,
  qmul,
  qconj,
  qnorm,
  qnormalize,
  qderiv,
  qfromEuler321,
  qtoEuler321,
  qtoDCM,
  rotateNEDtoBody,
  rotateBodyToNED,
  rk4Step,
  m3mul,
  m3transpose,
  m3identity,
  vec3,
  type Quat,
  type Mat3,
} from '@fds/physics-core';

const expectMatClose = (a: Mat3, b: Mat3, digits = 10): void => {
  for (let i = 0; i < 9; i++) expect(a[i]).toBeCloseTo(b[i], digits);
};

// Passive (coordinate) elementary rotations, so that C_{b/n} = Rx·Ry·Rz.
const Rx = (a: number): Mat3 => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const Ry = (a: number): Mat3 => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const Rz = (a: number): Mat3 => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];

describe('quaternion algebra & conventions', () => {
  it('identity is a multiplicative unit', () => {
    const q: Quat = qnormalize([0.5, -0.3, 0.8, 0.1]);
    const r = qmul(q, qidentity());
    for (let i = 0; i < 4; i++) expect(r[i]).toBeCloseTo(q[i], 12);
  });

  it('q ⊗ q* = 1 for a unit quaternion', () => {
    const q: Quat = qnormalize([0.5, -0.3, 0.8, 0.1]);
    const r = qmul(q, qconj(q));
    expect(r[0]).toBeCloseTo(1, 12);
    expect(r[1]).toBeCloseTo(0, 12);
    expect(r[2]).toBeCloseTo(0, 12);
    expect(r[3]).toBeCloseTo(0, 12);
  });

  it('qnormalize yields unit norm', () => {
    expect(qnorm(qnormalize([2, -1, 4, 3]))).toBeCloseTo(1, 12);
  });

  it('qderiv equals ½·Ω(ω)·q from README §3.1 written out explicitly', () => {
    const q: Quat = qnormalize([0.2, 0.5, -0.4, 0.7]);
    const w = vec3(0.3, -0.6, 0.9);
    const [p, qq, r] = [w.x, w.y, w.z];
    // Ω(ω) exactly as in the README, then ½·Ω·q.
    const Omega = [
      [0, -p, -qq, -r],
      [p, 0, r, -qq],
      [qq, -r, 0, p],
      [r, qq, -p, 0],
    ];
    const expected = [0, 1, 2, 3].map(
      (i) => 0.5 * (Omega[i][0] * q[0] + Omega[i][1] * q[1] + Omega[i][2] * q[2] + Omega[i][3] * q[3]),
    );
    const got = qderiv(q, w);
    for (let i = 0; i < 4; i++) expect(got[i]).toBeCloseTo(expected[i], 12);
  });

  it('Euler 3-2-1 round-trips through the quaternion', () => {
    const cases: Array<[number, number, number]> = [
      [0.3, -0.5, 1.2],
      [0.1, 0.2, 0.3],
      [-0.7, 0.4, -2.0],
    ];
    for (const [phi, theta, psi] of cases) {
      const e = qtoEuler321(qfromEuler321(phi, theta, psi));
      expect(e.phi).toBeCloseTo(phi, 10);
      expect(e.theta).toBeCloseTo(theta, 10);
      expect(e.psi).toBeCloseTo(psi, 10);
    }
  });

  it('qtoDCM(qfromEuler321) equals Rx(φ)·Ry(θ)·Rz(ψ)', () => {
    const [phi, theta, psi] = [0.3, -0.5, 1.2];
    const dcm = qtoDCM(qfromEuler321(phi, theta, psi));
    const expected = m3mul(Rx(phi), m3mul(Ry(theta), Rz(psi)));
    expectMatClose(dcm, expected);
  });

  it('qtoDCM is orthonormal (C·Cᵀ = I)', () => {
    const q = qfromEuler321(0.4, 0.9, -1.1);
    expectMatClose(m3mul(qtoDCM(q), m3transpose(qtoDCM(q))), m3identity());
  });

  it('rotateNEDtoBody and rotateBodyToNED are inverses', () => {
    const q = qfromEuler321(0.4, -0.2, 0.8);
    const v = vec3(3, -1, 2);
    const back = rotateBodyToNED(q, rotateNEDtoBody(q, v));
    expect(back.x).toBeCloseTo(v.x, 10);
    expect(back.y).toBeCloseTo(v.y, 10);
    expect(back.z).toBeCloseTo(v.z, 10);
  });

  it('pure +90° yaw puts NED-North on the body −Y (starboard-left) axis', () => {
    const q = qfromEuler321(0, 0, Math.PI / 2);
    const north = rotateNEDtoBody(q, vec3(1, 0, 0));
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.y).toBeCloseTo(-1, 10);
    expect(north.z).toBeCloseTo(0, 10);
  });

  it('normalization drift stays bounded over 1e5 RK4 steps (README §10.1)', () => {
    const omega = vec3(0, 0, 1); // constant-rate spin about Down
    const dt = 1e-4;
    const nSteps = 100_000;
    const deriv = (_t: number, s: Float64Array): Float64Array =>
      Float64Array.from(qderiv([s[0], s[1], s[2], s[3]], omega));

    let x: Float64Array = new Float64Array([1, 0, 0, 0]);
    for (let i = 0; i < nSteps; i++) {
      x = rk4Step(deriv, i * dt, x, undefined, dt);
      const n = qnormalize([x[0], x[1], x[2], x[3]]);
      x = Float64Array.from(n);
    }

    const finalNorm = Math.hypot(x[0], x[1], x[2], x[3]);
    expect(Math.abs(finalNorm - 1)).toBeLessThan(1e-9);

    // Analytic result: rotation about Down by |ω|·T = 10 rad → [cos5, 0, 0, sin5].
    const theta = omega.z * nSteps * dt;
    const analytic = [Math.cos(theta / 2), 0, 0, Math.sin(theta / 2)];
    const dot = x[0] * analytic[0] + x[1] * analytic[1] + x[2] * analytic[2] + x[3] * analytic[3];
    expect(Math.abs(dot)).toBeGreaterThan(1 - 1e-6); // same rotation (up to sign)
  });
});
