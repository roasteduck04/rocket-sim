/**
 * 6-DOF rocket equations of motion (README §4.2).
 *
 * Translational (body-frame Newton with the rotating-frame correction):
 * ```
 * m·(v̇_body + ω×v_body) = F_aero + F_thrust + R(q)·g_NED     (R(q): NED→body)
 * ```
 * Rotational (Euler's rigid-body equation, İ·ω term neglected — plan A10):
 * ```
 * I·ω̇ + ω×(I·ω) = M_aero + M_thrust
 * ```
 * Kinematics: `ṙ_NED = R(q)ᵀ·v_body`, `q̇ = ½·Ω(ω)·q`, `ṁ = −ṁ_prop`.
 *
 * Gravity is inverse-square, pointing +Down in NED (README §3.3); wind is
 * subtracted in the body frame before the aero build (plan A15). The İ·ω term is
 * dropped per standard quasi-static practice (documented in `docs/equations.md`).
 */

import {
  gravityAtAltitude,
  qderiv,
  rotateNEDtoBody,
  rotateBodyToNED,
  m3vec,
  m3inv,
  vadd,
  vcross,
  vsub,
  vscale,
  type Vec3,
} from '@fds/physics-core';
import { atmosphere, windAtAltitude } from '@fds/atmosphere-models';
import { unpackState, packState } from './state.js';
import { massProps } from './massProperties.js';
import { aeroForcesMoments } from './aero.js';
import { thrustAt } from './propulsion.js';
import { thrustForceMoment } from './tvc.js';
import type { GimbalCommand, RocketConfig, RocketEnv, RocketState } from './types.js';

/** Bundle passed as the integrator's opaque control argument. */
export interface DerivInput {
  cfg: RocketConfig;
  /** Gimbal + throttle command, held constant across the RK4 step (ZOH). */
  controls: GimbalCommand;
  env: RocketEnv;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * State derivative ẋ for the integrator (README §4.2). The controls are held
 * constant across the step; all mass properties, the gimbal moment arm, and the
 * thrust/aero forces are evaluated at the instantaneous state (traps T1, T2).
 */
export const derivRocket = (t: number, x: Float64Array, u: DerivInput): Float64Array => {
  const { cfg, controls, env } = u;
  const s: RocketState = unpackState(x);

  const mDry = cfg.mass.dryKg;
  const m = Math.max(s.mass, mDry); // guard against a sub-dry overshoot
  const mProp = s.mass - mDry;

  const h = -s.r.z; // NED z points Down
  const atmo = atmosphere(h);

  const mp = massProps(cfg.mass, mProp);

  // Wind in the body frame (plan A15): v_rel_body = v_body − R(q)·wind_NED.
  const windNED: Vec3 = env.wind ? windAtAltitude(env.wind, h) : { x: 0, y: 0, z: 0 };
  const windBody = rotateNEDtoBody(s.q, windNED);

  const aero = aeroForcesMoments(cfg.geometry, cfg.aero, {
    vBody: s.v,
    windBody,
    omega: s.omega,
    rho: atmo.rho,
    a: atmo.a,
    cgFromNose: mp.cgFromNose,
  });

  // Propulsion — cut when propellant is exhausted; scale by throttle (A7, A9).
  const throttle = clamp(controls.throttle, 0, 1);
  const burning = mProp > 0;
  const raw = thrustAt(cfg.propulsion, t, atmo.p);
  const T = burning ? raw.T * throttle : 0;
  const mdot = burning ? raw.mdot * throttle : 0;
  const thrust = thrustForceMoment(T, controls.deltaP, controls.deltaY, mp.cgFromNose, cfg.propulsion.gimbal);

  // Gravity resolved into the body frame.
  const gMag = gravityAtAltitude(h);
  const Fgrav = rotateNEDtoBody(s.q, { x: 0, y: 0, z: m * gMag });

  // Translational: v̇ = F_total/m − ω×v.
  const Ftot = vadd(vadd(aero.F, thrust.F), Fgrav);
  const vdot = vsub(vscale(Ftot, 1 / m), vcross(s.omega, s.v));

  // Rotational: ω̇ = I⁻¹·(M − ω×(I·ω)).
  const Mtot = vadd(aero.M, thrust.M);
  const Iomega = m3vec(mp.I, s.omega);
  const gyro = vcross(s.omega, Iomega);
  const omegadot = m3vec(m3inv(mp.I), vsub(Mtot, gyro));

  // Kinematics.
  const rdot = rotateBodyToNED(s.q, s.v);
  const qdot = qderiv(s.q, s.omega);

  // packState lays out [ṙ, v̇, q̇, ω̇, ṁ] in the same 14-slot order as the state.
  return packState({
    r: rdot,
    v: vdot,
    q: qdot,
    omega: omegadot,
    mass: -mdot,
  });
};
