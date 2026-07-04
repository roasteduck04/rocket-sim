import { describe, it, expect } from 'vitest';
import {
  rk4Step,
  integrateFixed,
  integrateAdaptive,
  G0,
} from '@fds/physics-core';

// Simple harmonic oscillator: ẍ = −ω²x, state [x, v]. Analytic (x0=1, v0=0):
// x(t) = cos(ωt), v(t) = −ω·sin(ωt).
const OMEGA = 2;
const sho = (_t: number, x: Float64Array): Float64Array =>
  Float64Array.of(x[1], -OMEGA * OMEGA * x[0]);
const shoAnalytic = (t: number): [number, number] => [
  Math.cos(OMEGA * t),
  -OMEGA * Math.sin(OMEGA * t),
];
const dist = (x: Float64Array, ref: [number, number]): number =>
  Math.hypot(x[0] - ref[0], x[1] - ref[1]);

describe('integrators', () => {
  it('RK4 and adaptive RK45 agree with the analytic SHO', () => {
    const x0 = Float64Array.of(1, 0);
    const T = 5;
    const rk4 = integrateFixed(sho, 0, x0, undefined, 0.001, { tEnd: T });
    const rk45 = integrateAdaptive(sho, 0, x0, undefined, { tEnd: T, tol: 1e-10 });
    const ref = shoAnalytic(T);

    expect(dist(rk4.x, ref)).toBeLessThan(1e-5);
    expect(dist(rk45.x, ref)).toBeLessThan(1e-5);
    // ...and therefore agree with each other.
    expect(Math.hypot(rk4.x[0] - rk45.x[0], rk4.x[1] - rk45.x[1])).toBeLessThan(1e-5);
  });

  it('RK4 exhibits 4th-order global convergence (error ratio ≈ 16 on halving dt)', () => {
    const x0 = Float64Array.of(1, 0);
    const T = 2;
    const ref = shoAnalytic(T);
    const errCoarse = dist(integrateFixed(sho, 0, x0, undefined, 0.1, { tEnd: T }).x, ref);
    const errFine = dist(integrateFixed(sho, 0, x0, undefined, 0.05, { tEnd: T }).x, ref);
    const ratio = errCoarse / errFine;
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });

  it('a single rk4Step advances the SHO one step accurately', () => {
    const x = Float64Array.of(1, 0);
    const dt = 1e-3;
    const next = rk4Step(sho, 0, x, undefined, dt);
    const ref = shoAnalytic(dt);
    expect(next[0]).toBeCloseTo(ref[0], 9);
    expect(next[1]).toBeCloseTo(ref[1], 9);
  });

  it('terminal event time is bisection-refined (falling body hits the ground)', () => {
    // ḣ = v, v̇ = −g; drop from 100 m, ground at h = 0. t* = √(2h₀/g).
    const g = G0;
    const deriv = (_t: number, x: Float64Array): Float64Array => Float64Array.of(x[1], -g);
    const x0 = Float64Array.of(100, 0);
    const res = integrateFixed(deriv, 0, x0, undefined, 0.01, {
      tEnd: 10,
      terminate: (_t, x) => x[0],
      eventTol: 1e-8,
    });
    const tStar = Math.sqrt((2 * 100) / g);
    expect(res.event).toBeDefined();
    expect(res.event!.time).toBeCloseTo(tStar, 5);
    expect(res.x[0]).toBeCloseTo(0, 5);
  });

  it('integration is deterministic (bit-identical on repeat)', () => {
    const x0 = Float64Array.of(1, 0);
    const a = integrateFixed(sho, 0, x0, undefined, 0.01, { tEnd: 3 });
    const b = integrateFixed(sho, 0, x0, undefined, 0.01, { tEnd: 3 });
    expect(a.x[0]).toBe(b.x[0]);
    expect(a.x[1]).toBe(b.x[1]);
  });

  it('integrateFixed honors a step count and rejects an empty spec', () => {
    const x0 = Float64Array.of(1, 0);
    const res = integrateFixed(sho, 0, x0, undefined, 0.01, { steps: 100 });
    expect(res.steps).toBe(100);
    expect(res.t).toBeCloseTo(1, 9);
    expect(() => integrateFixed(sho, 0, x0, undefined, 0.01, {})).toThrow();
  });
});
