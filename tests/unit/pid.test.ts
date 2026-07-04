/**
 * Unit tests for the Phase 3 TVC control loop (README §4.6): the `Pid` core
 * (integral anti-windup, derivative-on-measurement) and the cascaded
 * `AttitudeController` (error signs, actuator clamp + slew limiting, roll stub).
 */
import { describe, it, expect } from 'vitest';
import { Pid, AttitudeController, wrapPi } from '@fds/rocket-sim';
import type { ControlConfig, GimbalConfig, RocketState } from '@fds/rocket-sim';
import { qfromEuler321 } from '@fds/physics-core';

const DT = 0.01;

describe('Pid (README §4.6)', () => {
  it('pure proportional: out = kp·err', () => {
    const pid = new Pid({ kp: 2, ki: 0, kd: 0 });
    expect(pid.update(0.5, 0, DT)).toBeCloseTo(1.0, 12);
    expect(pid.update(-0.25, 0, DT)).toBeCloseTo(-0.5, 12);
  });

  it('integral accumulates ki·∫err dt and reset() clears it', () => {
    const pid = new Pid({ kp: 0, ki: 1, kd: 0 });
    let out = 0;
    for (let i = 0; i < 100; i++) out = pid.update(0.2, 0, DT); // ∫ = 0.2·1s
    expect(out).toBeCloseTo(0.2, 12);
    pid.reset();
    expect(pid.update(0, 0, DT)).toBeCloseTo(0, 12);
  });

  it('derivative is fed by the measured rate — no kick on an error step', () => {
    const pid = new Pid({ kp: 1, ki: 0, kd: 10 });
    // Large error step with zero measured rate: no d(err)/dt differentiation,
    // so the output is the proportional term only.
    expect(pid.update(1, 0, DT)).toBeCloseTo(1, 12);
    // Rate feedback acts directly: err = 0 but the vehicle is pitching.
    expect(pid.update(0, -0.3, DT)).toBeCloseTo(-3, 12);
  });

  it('anti-windup clamps the integral contribution to ±integralLimit', () => {
    const pid = new Pid({ kp: 0, ki: 1, kd: 0 }, { integralLimit: 0.1 });
    for (let i = 0; i < 1000; i++) pid.update(1, 0, DT); // would reach 10 unclamped
    expect(pid.integralTerm).toBeCloseTo(0.1, 12);
    // Recovery: with the clamp, a reversed error unwinds immediately instead of
    // draining seconds of accumulated windup first.
    const drained = pid.update(-1, 0, 0.05); // integral 0.1 → 0.05
    expect(drained).toBeCloseTo(0.05, 12);
  });

  it('without a limit the integral winds up unbounded', () => {
    const pid = new Pid({ kp: 0, ki: 1, kd: 0 });
    for (let i = 0; i < 1000; i++) pid.update(1, 0, DT);
    expect(pid.integralTerm).toBeCloseTo(10, 9);
  });
});

describe('wrapPi', () => {
  it('wraps to (−π, π]', () => {
    expect(wrapPi(0.5)).toBeCloseTo(0.5, 12);
    expect(wrapPi(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(wrapPi(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 12);
    expect(wrapPi(2 * Math.PI)).toBeCloseTo(0, 12);
  });
});

// ---------------------------------------------------------------------------
// AttitudeController
// ---------------------------------------------------------------------------

const gimbal: GimbalConfig = {
  maxDeflectionRad: 0.1,
  maxSlewRateRps: 0.35, // ≈ 20°/s
  positionFromNoseM: 9,
};
const control: ControlConfig = {
  pidPitch: { kp: 0.8, ki: 0.05, kd: 0.6 },
  pidYaw: { kp: 0.8, ki: 0.05, kd: 0.6 },
  rollControlEnabled: false,
};

/** Vehicle state at a given Euler attitude and body rate, everything else zero. */
const stateAt = (theta: number, psi: number, q = 0, r = 0): RocketState => ({
  r: { x: 0, y: 0, z: -1000 },
  v: { x: 0, y: 0, z: 0 },
  q: qfromEuler321(0, theta, psi),
  omega: { x: 0, y: q, z: r },
  mass: 1000,
});

describe('AttitudeController (README §4.6)', () => {
  it('positive pitch error → positive δp (nose-up command)', () => {
    const ctl = new AttitudeController(control, gimbal);
    const act = ctl.update({ theta: 0.05, psi: 0 }, stateAt(0, 0), DT);
    expect(act.deltaP).toBeGreaterThan(0);
    expect(act.deltaY).toBeCloseTo(0, 12);
  });

  it('positive yaw error → positive δy (nose-right command)', () => {
    const ctl = new AttitudeController(control, gimbal);
    const act = ctl.update({ theta: 0, psi: 0.05 }, stateAt(0, 0), DT);
    expect(act.deltaY).toBeGreaterThan(0);
    expect(act.deltaP).toBeCloseTo(0, 12);
  });

  it('rate feedback opposes the motion: zero error, +q pitch rate → negative δp', () => {
    const ctl = new AttitudeController(control, gimbal);
    const act = ctl.update({ theta: 0, psi: 0 }, stateAt(0, 0, 0.2), DT);
    expect(act.deltaP).toBeLessThan(0);
  });

  it('zero error, +r yaw rate → negative δy', () => {
    const ctl = new AttitudeController(control, gimbal);
    const act = ctl.update({ theta: 0, psi: 0 }, stateAt(0, 0, 0, 0.2), DT);
    expect(act.deltaY).toBeLessThan(0);
  });

  it('output is slew-rate limited step to step and clamped at ±δ_max', () => {
    // Huge error → PID demands far beyond the actuator; watch it ramp.
    const hot: ControlConfig = { ...control, pidPitch: { kp: 100, ki: 0, kd: 0 } };
    const ctl = new AttitudeController(hot, gimbal);
    const maxStep = gimbal.maxSlewRateRps * DT;
    let prev = 0;
    for (let i = 1; i <= 60; i++) {
      const { deltaP } = ctl.update({ theta: 1, psi: 0 }, stateAt(0, 0), DT);
      expect(deltaP - prev).toBeLessThanOrEqual(maxStep + 1e-12);
      expect(deltaP).toBeLessThanOrEqual(gimbal.maxDeflectionRad + 1e-12);
      prev = deltaP;
    }
    // After 60 steps (0.6 s) the ramp has certainly hit the ±δ_max stop.
    expect(prev).toBeCloseTo(gimbal.maxDeflectionRad, 12);
  });

  it('yaw error wraps: ψ_cmd just past −π vs ψ just past +π takes the short way', () => {
    const ctl = new AttitudeController(control, gimbal);
    // ψ = +175°, command −175° → true error +10°, not −350°.
    const act = ctl.update(
      { theta: 0, psi: -Math.PI + degish(5) },
      stateAt(0, Math.PI - degish(5)),
      DT,
    );
    expect(act.deltaY).toBeGreaterThan(0);
  });

  it('reset() clears the integral state', () => {
    const ki: ControlConfig = { ...control, pidPitch: { kp: 0, ki: 1, kd: 0 } };
    const ctl = new AttitudeController(ki, gimbal);
    for (let i = 0; i < 200; i++) ctl.update({ theta: 0.05, psi: 0 }, stateAt(0, 0), DT);
    ctl.reset();
    const act = ctl.update({ theta: 0, psi: 0 }, stateAt(0, 0), DT);
    expect(act.deltaP).toBeCloseTo(0, 12);
  });

  it('roll channel is a stub: enabling it is rejected (README §4.6)', () => {
    const bad: ControlConfig = { ...control, rollControlEnabled: true };
    expect(() => new AttitudeController(bad, gimbal)).toThrow(/roll/i);
  });
});

/** Degrees → radians, local shorthand. */
function degish(deg: number): number {
  return (deg * Math.PI) / 180;
}
