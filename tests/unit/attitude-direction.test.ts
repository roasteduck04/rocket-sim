/**
 * Direction-vector attitude control (Phase 4). The Euler-based
 * `AttitudeController.update` is singular at θ = ±90°, but a landing burn is
 * flown nose-up — so `updateDirection` commands a desired nose (+X) direction
 * in NED and forms the body-frame pointing errors
 *
 *   b  = R(q)·d̂_NED          (commanded direction in body axes)
 *   eP = atan2(−b_z, b_x)     (pitch error, about +Y_body)
 *   eY = atan2(+b_y, b_x)     (yaw error, about +Z_body)
 *
 * which feed the SAME per-channel PIDs and actuator as the Euler path. Sign
 * closure matches Phase 3: eP > 0 → +δp → nose-up moment, eY > 0 → +δy →
 * nose-right moment.
 */
import { describe, it, expect } from 'vitest';
import { AttitudeController } from '@fds/rocket-sim';
import type { ControlConfig, GimbalConfig, RocketState } from '@fds/rocket-sim';
import { qfromEuler321, qidentity, vnormalize } from '@fds/physics-core';
import type { Vec3 } from '@fds/physics-core';

// Wide limits + huge slew → the actuator is a passthrough, so the returned
// gimbal angles ARE the PID outputs and the error math is tested directly.
const gimbal: GimbalConfig = {
  maxDeflectionRad: 1,
  maxSlewRateRps: 1e4,
  positionFromNoseM: 11.8,
};
const pOnly: ControlConfig = {
  pidPitch: { kp: 1, ki: 0, kd: 0 },
  pidYaw: { kp: 1, ki: 0, kd: 0 },
  rollControlEnabled: false,
};

const state = (q: RocketState['q'], omega: Vec3 = { x: 0, y: 0, z: 0 }): RocketState => ({
  r: { x: 0, y: 0, z: -1000 },
  v: { x: 0, y: 0, z: 0 },
  q,
  omega,
  mass: 3000,
});

const noseUp = qfromEuler321(0, Math.PI / 2, 0); // +X body = up (−Z NED)
const DT = 0.01;

describe('AttitudeController.updateDirection (non-singular at vertical)', () => {
  it('returns zero gimbal when the nose already points along the command', () => {
    const c = new AttitudeController(pOnly, gimbal);
    const out = c.updateDirection({ x: 0, y: 0, z: -1 }, state(noseUp), DT);
    expect(out.deltaP).toBeCloseTo(0, 12);
    expect(out.deltaY).toBeCloseTo(0, 12);
  });

  it('nose-up vehicle, command tilted toward North → pitch-down command (−δp), zero yaw', () => {
    // At q = qfromEuler321(0, 90°, 0) body Z points North: tilting the nose
    // toward North means REDUCING θ from 90°, i.e. a negative pitch error.
    const tilt = 0.1;
    const d = vnormalize({ x: Math.sin(tilt), y: 0, z: -Math.cos(tilt) });
    const c = new AttitudeController(pOnly, gimbal);
    const out = c.updateDirection(d, state(noseUp), DT);
    expect(out.deltaP).toBeCloseTo(-tilt, 6);
    expect(out.deltaY).toBeCloseTo(0, 12);
  });

  it('nose-up vehicle, command tilted toward East → nose-right command (+δy), zero pitch', () => {
    // Body Y stays East at this attitude, so an eastward tilt is a pure +yaw error.
    const tilt = 0.1;
    const d = vnormalize({ x: 0, y: Math.sin(tilt), z: -Math.cos(tilt) });
    const c = new AttitudeController(pOnly, gimbal);
    const out = c.updateDirection(d, state(noseUp), DT);
    expect(out.deltaY).toBeCloseTo(tilt, 6);
    expect(out.deltaP).toBeCloseTo(0, 12);
  });

  it('matches the Euler-based update away from the singularity', () => {
    // Horizontal vehicle (θ = 0): commanding direction (cosθc, 0, −sinθc) is
    // the same request as the Euler command {theta: θc, psi: 0}.
    const thetaCmd = 0.05;
    const d = { x: Math.cos(thetaCmd), y: 0, z: -Math.sin(thetaCmd) };
    const byDir = new AttitudeController(pOnly, gimbal).updateDirection(d, state(qidentity()), DT);
    const byEuler = new AttitudeController(pOnly, gimbal).update(
      { theta: thetaCmd, psi: 0 },
      state(qidentity()),
      DT,
    );
    expect(byDir.deltaP).toBeCloseTo(byEuler.deltaP, 10);
    expect(byDir.deltaY).toBeCloseTo(byEuler.deltaY, 10);
  });

  it('applies rate feedback Kd·(−q, −r) exactly as the Euler path does', () => {
    const withKd: ControlConfig = {
      pidPitch: { kp: 1, ki: 0, kd: 0.5 },
      pidYaw: { kp: 1, ki: 0, kd: 0.5 },
      rollControlEnabled: false,
    };
    const omega = { x: 0, y: 0.2, z: -0.1 };
    const c = new AttitudeController(withKd, gimbal);
    // Aligned command → pure rate damping: δp = kd·(−q), δy = kd·(−r).
    const out = c.updateDirection({ x: 0, y: 0, z: -1 }, state(noseUp, omega), DT);
    expect(out.deltaP).toBeCloseTo(0.5 * -0.2, 10);
    expect(out.deltaY).toBeCloseTo(0.5 * 0.1, 10);
  });
});
