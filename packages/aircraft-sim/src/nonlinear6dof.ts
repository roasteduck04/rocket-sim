/**
 * Nonlinear 6-DOF aircraft model — Module C upgrade path (README §11 Phase 7,
 * plan: "reuses rocket-sim EOM structure").
 *
 * Rigid-body equations identical in structure to `rocket-sim/deriv.ts`:
 *
 *   m·(v̇_body + ω×v_body) = F_aero + F_thrust + R(q)·[0, 0, m·g0]
 *   I·ω̇ + ω×(I·ω)         = M_aero              (I diagonal — §8.3 has no Ixz)
 *   ṙ_NED = R(q)ᵀ·v_body,   q̇ = ½·Ω(ω)·q
 *
 * State (13): [r_NED(3), v_body(3) = (u,v,w), q(4) NED→body, ω(3) = (p,q,r)].
 *
 * The aero force/moment build reuses the SAME non-dimensional derivative set
 * as the linear model (README §8.3 + plan A2), evaluated about the §6.1 trim:
 *
 *   α = atan2(w, u), β = asin(v/V), û = (V − U0)/U0
 *   CL = CL0 + CL_α·α + CL_q·q̂ + CL_δe·δe + CL_u·û          (q̂ = q·c̄/(2V))
 *   CD = max(0, CD0 + CD_α·α + CD_u·û)
 *   CY = CY_β·β + CY_p·p̂ + CY_r·r̂ + CY_δa·δa + CY_δr·δr    (p̂,r̂ = p,r·b/(2V))
 *   Cl = Cl_β·β + Cl_p·p̂ + Cl_r·r̂ + Cl_δa·δa + Cl_δr·δr
 *   Cm = Cm_α·α + Cm_q·q̂ + Cm_α̇·(α̇·c̄/(2V)) + Cm_δe·δe + Cm_u·û
 *   Cn = Cn_β·β + Cn_p·p̂ + Cn_r·r̂ + Cn_δa·δa + Cn_δr·δr
 *
 * so the coefficients stay locally linear (all the derivative set supports)
 * while every OTHER nonlinearity is real: quaternion attitude (no small-angle
 * θ, φ), gyroscopic ω×(I·ω), kinematic ω×v, q̄ ∝ V², rate terms scaled by the
 * instantaneous V, gravity tilt through the full DCM, and ρ(h) from US76.
 * Wind-to-body force resolution uses the α-plane decomposition (X = L·sinα −
 * D·cosα, Z = −L·cosα − D·sinα, Y from CY) — exact at β = 0 and first-order
 * correct in β, matching the linear model's lon/lat decoupling at trim.
 *
 * α̇ for the Cm_α̇ term is evaluated with the standard two-pass scheme: the
 * translational accelerations are computed once WITHOUT the α̇ moment, α̇ is
 * formed from (u·ẇ − w·u̇)/(u² + w²), and only the pitch moment is corrected.
 * Linearized at trim this reproduces exactly the README §6.2 M_α̇ folding
 * (`Malpha + Malphadot·Zalpha/U0`, …) that `buildLonStateSpace` writes into A.
 *
 * Thrust: constant-direction body-X force T = max(0, T0 + m·X_δt·δt), with
 * T0 = q̄0·S·CD0 + m·g0·sinθ0 the trim thrust (X-balance at the §6.1 trim) and
 * δt the throttle PERTURBATION from trim, matching the linear B-matrix column.
 *
 * Trim caveat (documented in docs/equations.md Phase 7): the reference state
 * from `trimState` is an exact equilibrium only when CL0 equals the A2
 * level-flight value m·g0·cosθ0/(q̄0·S) — the loader computes exactly that
 * when the YAML omits CL0. A config with a published CL0 (e.g. the Navion's
 * 0.41 vs 0.406 implied) carries a small constant force residual; the
 * Jacobian (and hence the modes) is unaffected.
 */

import {
  G0,
  qderiv,
  qfromEuler321,
  qnormalize,
  qtoEuler321,
  rotateBodyToNED,
  rotateNEDtoBody,
  rk4Step,
  type Quat,
  type Vec3,
} from '@fds/physics-core';
import { atmosphere } from '@fds/atmosphere-models';
import { trimDynamicPressure } from './dimensionalize.js';
import type { AircraftConfig, ControlsLat, ControlsLon } from './types.js';

/** Number of state-vector elements: r(3) + v(3) + q(4) + ω(3). */
export const AIRCRAFT6DOF_STATE_SIZE = 13;

/** Unpacked 6-DOF state (rocket-sim conventions: NED position, body velocity). */
export interface Aircraft6DofState {
  /** Position in local NED relative to the trim point, m. */
  r: Vec3;
  /** Body-frame velocity (u, v, w), m/s. */
  v: Vec3;
  /** Attitude quaternion, NED→body, scalar-first. */
  q: Quat;
  /** Body rates (p, q, r), rad/s. */
  omega: Vec3;
}

/** Pack into the integrator's flat 13-vector. */
export const packAircraftState = (s: Aircraft6DofState): Float64Array =>
  Float64Array.of(
    s.r.x, s.r.y, s.r.z,
    s.v.x, s.v.y, s.v.z,
    s.q[0], s.q[1], s.q[2], s.q[3],
    s.omega.x, s.omega.y, s.omega.z,
  );

/** Unpack the flat 13-vector. */
export const unpackAircraftState = (x: Float64Array): Aircraft6DofState => ({
  r: { x: x[0], y: x[1], z: x[2] },
  v: { x: x[3], y: x[4], z: x[5] },
  q: [x[6], x[7], x[8], x[9]],
  omega: { x: x[10], y: x[11], z: x[12] },
});

/** Control inputs: elevator/throttle-perturbation + aileron/rudder, rad. */
export interface Aircraft6DofControls {
  deltaE: number;
  deltaT: number;
  deltaA: number;
  deltaR: number;
}

/** Trim thrust T0 = q̄0·S·CD0 + m·g0·sinθ0 (§6.1 X-balance), N. */
export const trimThrust = (cfg: AircraftConfig): number =>
  trimDynamicPressure(cfg) * cfg.geometry.wingAreaM2 * cfg.lon.CD0 +
  cfg.mass.massKg * G0 * Math.sin(cfg.trim.theta0Rad);

/**
 * Reference (trim) state: level flight at U0 along North, pitch θ0, body axes
 * aligned with stability axes (α = 0 at trim by construction).
 */
export const trimState = (cfg: AircraftConfig): Aircraft6DofState => ({
  r: { x: 0, y: 0, z: 0 },
  v: { x: cfg.trim.U0Mps, y: 0, z: 0 },
  q: qfromEuler321(0, cfg.trim.theta0Rad, 0),
  omega: { x: 0, y: 0, z: 0 },
});

/**
 * State derivative ẋ (pure function — README §1). Altitude for ρ is the trim
 * altitude minus the NED-down displacement.
 */
export const derivAircraft6Dof = (
  _t: number,
  x: Float64Array,
  input: { cfg: AircraftConfig; controls: Aircraft6DofControls },
): Float64Array => {
  const { cfg, controls } = input;
  const s = unpackAircraftState(x);
  const { wingAreaM2: S, chordM: cbar, spanM: b } = cfg.geometry;
  const { massKg: m, IxxKgm2: Ixx, IyyKgm2: Iyy, IzzKgm2: Izz } = cfg.mass;
  const U0 = cfg.trim.U0Mps;
  const cl = cfg.lon;
  const ct = cfg.lat;

  const { x: u, y: v, z: w } = s.v;
  const V = Math.sqrt(u * u + v * v + w * w);
  const alpha = Math.atan2(w, u);
  const beta = Math.asin(Math.max(-1, Math.min(1, v / (V || 1))));
  const uhat = (V - U0) / U0;

  const h = cfg.trim.altitudeM - s.r.z;
  const rho = atmosphere(Math.max(0, h)).rho;
  const qbar = 0.5 * rho * V * V;
  const QS = qbar * S;

  // Rate non-dimensionalization on the INSTANTANEOUS V (equals U0 at trim).
  const twoV = 2 * (V || 1);
  const phat = (s.omega.x * b) / twoV;
  const qhat = (s.omega.y * cbar) / twoV;
  const rhat = (s.omega.z * b) / twoV;

  const { deltaE, deltaT, deltaA, deltaR } = controls;

  const CL =
    cl.CL0 + cl.CL_alpha * alpha + cl.CL_q * qhat + cl.CL_delta_e * deltaE + cl.CL_u * uhat;
  const CD = Math.max(0, cl.CD0 + cl.CD_alpha * alpha + cl.CD_u * uhat);
  const CY =
    ct.CY_beta * beta +
    ct.CY_p * phat +
    ct.CY_r * rhat +
    ct.CY_delta_a * deltaA +
    ct.CY_delta_r * deltaR;

  const lift = QS * CL;
  const drag = QS * CD;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);

  const T = Math.max(0, trimThrust(cfg) + m * cl.X_delta_t * deltaT);

  // Body-frame forces (α-plane decomposition; see header).
  const Fx = lift * sa - drag * ca + T;
  const Fy = QS * CY;
  const Fz = -lift * ca - drag * sa;

  // Gravity through the full attitude (no small-angle assumption).
  const Fgrav = rotateNEDtoBody(s.q, { x: 0, y: 0, z: m * G0 });

  // Translational: v̇ = F/m − ω×v.
  const vdot: Vec3 = {
    x: (Fx + Fgrav.x) / m - (s.omega.y * w - s.omega.z * v),
    y: (Fy + Fgrav.y) / m - (s.omega.z * u - s.omega.x * w),
    z: (Fz + Fgrav.z) / m - (s.omega.x * v - s.omega.y * u),
  };

  // Two-pass α̇ for the Cm_α̇ term (see header).
  const V2 = u * u + w * w;
  const alphadot = V2 > 0 ? (u * vdot.z - w * vdot.x) / V2 : 0;

  const Cl_ =
    ct.Cl_beta * beta +
    ct.Cl_p * phat +
    ct.Cl_r * rhat +
    ct.Cl_delta_a * deltaA +
    ct.Cl_delta_r * deltaR;
  const Cm =
    cl.Cm_alpha * alpha +
    cl.Cm_q * qhat +
    cl.Cm_alpha_dot * ((alphadot * cbar) / twoV) +
    cl.Cm_delta_e * deltaE +
    cl.Cm_u * uhat;
  const Cn =
    ct.Cn_beta * beta +
    ct.Cn_p * phat +
    ct.Cn_r * rhat +
    ct.Cn_delta_a * deltaA +
    ct.Cn_delta_r * deltaR;

  const Ml = QS * b * Cl_;
  const Mm = QS * cbar * Cm;
  const Mn = QS * b * Cn;

  // Rotational: ω̇ = I⁻¹·(M − ω×(I·ω)) with diagonal I.
  const { x: p, y: qq, z: r } = s.omega;
  const omegadot: Vec3 = {
    x: (Ml - (qq * Izz * r - r * Iyy * qq)) / Ixx,
    y: (Mm - (r * Ixx * p - p * Izz * r)) / Iyy,
    z: (Mn - (p * Iyy * qq - qq * Ixx * p)) / Izz,
  };

  // Kinematics.
  const rdot = rotateBodyToNED(s.q, s.v);
  const qdot = qderiv(s.q, s.omega);

  return Float64Array.of(
    rdot.x, rdot.y, rdot.z,
    vdot.x, vdot.y, vdot.z,
    qdot[0], qdot[1], qdot[2], qdot[3],
    omegadot.x, omegadot.y, omegadot.z,
  );
};

/**
 * Linear-model-equivalent perturbation readout for comparison and display:
 * `[Δu, α, q, θ]` and `[β, p, r, φ]` (README §6.2/§6.3 states).
 */
export interface LinearEquivalentState {
  du: number;
  alpha: number;
  q: number;
  theta: number;
  beta: number;
  p: number;
  r: number;
  phi: number;
}

/** Extract the README §6 perturbation states from a full 6-DOF state. */
export const toLinearEquivalent = (
  s: Aircraft6DofState,
  cfg: AircraftConfig,
): LinearEquivalentState => {
  const { x: u, y: v, z: w } = s.v;
  const V = Math.sqrt(u * u + v * v + w * w);
  const euler = qtoEuler321(s.q);
  return {
    du: u - cfg.trim.U0Mps,
    alpha: Math.atan2(w, u),
    q: s.omega.y,
    theta: euler.theta - cfg.trim.theta0Rad,
    beta: Math.asin(Math.max(-1, Math.min(1, v / (V || 1)))),
    p: s.omega.x,
    r: s.omega.z,
    phi: euler.phi,
  };
};

/**
 * Stateful fixed-step RK4 runner mirroring `AircraftSim` (README §6.4): same
 * `[δe, δt]` / `[δa, δr]` control tuples, default dt = 1/60 s, quaternion
 * renormalized after every step.
 */
export class NonlinearAircraftSim {
  private x: Float64Array;
  private time = 0;

  constructor(private readonly cfg: AircraftConfig) {
    this.x = packAircraftState(trimState(cfg));
  }

  /** Reset to the trim state (optionally overridden) at t = 0. */
  reset(init?: Partial<Aircraft6DofState>): void {
    this.time = 0;
    this.x = packAircraftState({ ...trimState(this.cfg), ...init });
  }

  /** Advance by `dt` under `[δe, δt]`, `[δa, δr]` (ZOH across the step). */
  step(uLon: ControlsLon, uLat: ControlsLat, dt = 1 / 60): void {
    const controls: Aircraft6DofControls = {
      deltaE: uLon[0],
      deltaT: uLon[1],
      deltaA: uLat[0],
      deltaR: uLat[1],
    };
    this.x = rk4Step(derivAircraft6Dof, this.time, this.x, { cfg: this.cfg, controls }, dt);
    // Renormalize the quaternion (fixed-step drift guard, README §10.1).
    const s = unpackAircraftState(this.x);
    this.x = packAircraftState({ ...s, q: qnormalize(s.q) });
    this.time += dt;
  }

  get t(): number {
    return this.time;
  }

  get state(): Aircraft6DofState {
    return unpackAircraftState(this.x);
  }

  /** README §6 perturbation states, for direct comparison with `AircraftSim`. */
  get linearEquivalent(): LinearEquivalentState {
    return toLinearEquivalent(this.state, this.cfg);
  }
}
