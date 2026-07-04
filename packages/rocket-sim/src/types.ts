/**
 * Types for the 6-DOF rocket flight simulator (README §4, §8.1).
 *
 * Conventions (see `docs/equations.md` Phase 2 for the full derivation):
 *  - Body axes X-forward (nose) / Y-right / Z-down (README §3.1). Thrust with
 *    zero gimbal is along +X; a station measured `_from_nose_m` sits aft of the
 *    nose, i.e. at body-X coordinate `(cg − station)` relative to the CG.
 *  - State `x = [r_NED(3), v_body(3), q(4), ω_body(3), m(1)]` (README §4.1);
 *    the attitude quaternion is NED→body, scalar-first (`@fds/physics-core`).
 *  - Altitude `h = −r_NED.z` (NED z points Down).
 *  - SI units throughout; angles radians unless a field name says `_deg`.
 */

import type { Vec3, Quat, Mat3 } from '@fds/physics-core';
import type { WindProfile } from '@fds/atmosphere-models';
import type { PidGains } from './control/pid.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Rocket state in object form (README §4.1). */
export interface RocketState {
  /** Position in local NED frame, m. */
  r: Vec3;
  /** Velocity in the BODY frame, m/s (u, v, w). */
  v: Vec3;
  /** Attitude quaternion, NED→body, scalar-first. */
  q: Quat;
  /** Angular rate in the body frame, rad/s (p, q, r). */
  omega: Vec3;
  /** Instantaneous vehicle mass, kg. */
  mass: number;
}

// ---------------------------------------------------------------------------
// Configuration (README §8.1 + plan ambiguities A5, A7, A11)
// ---------------------------------------------------------------------------

/** Principal-axis dry-structure inertia about the DRY CG, kg·m² (README §8.1). */
export interface DryInertia {
  Ixx: number;
  Iyy: number;
  Izz: number;
}

/**
 * Mass properties (README §8.1 `mass` + A5 tank geometry). The propellant is
 * modelled as a solid cylinder draining top-down: its column shrinks from the
 * top, so the remaining propellant collects toward `tankBottomFromNoseM` and the
 * propellant CG migrates aft as the tank empties (README §4.5).
 */
export interface MassConfig {
  dryKg: number;
  propellantKg: number;
  /** Dry-structure CG station from the nose, m. */
  dryCgFromNoseM: number;
  /** Propellant CG station from the nose at FULL load, m. */
  propellantCgFromNoseM: number;
  /** Aft end of the propellant column (tank bottom) from the nose, m (A5). */
  tankBottomFromNoseM: number;
  /** Propellant column radius, m (A5; defaults to the vehicle radius). */
  tankRadiusM: number;
  /** Dry-structure inertia about the dry CG (A6). */
  dryInertiaKgm2: DryInertia;
}

/** Reference geometry (README §8.1 `geometry`). */
export interface Geometry {
  lengthM: number;
  diameterM: number;
  /** Aerodynamic reference area S_ref, m². */
  refAreaM2: number;
}

/** Thrust-vector-control gimbal limits (README §8.1 `propulsion.gimbal`). */
export interface GimbalConfig {
  /** Actuator deflection limit ±δ_max, rad. */
  maxDeflectionRad: number;
  /** Actuator slew-rate limit, rad/s. */
  maxSlewRateRps: number;
  /** Gimbal pivot station from the nose, m. */
  positionFromNoseM: number;
}

/** Throttle authority (plan A7; absent from README §8.1). */
export interface ThrottleConfig {
  min: number;
  max: number;
}

/** A tabulated thrust curve: strictly increasing `time`, matching `thrust`. */
export interface ThrustCurve {
  /** Sample times, s (strictly increasing, starting at 0). */
  time: number[];
  /** Thrust at each sample time, N. */
  thrust: number[];
}

/** Propulsion configuration (README §8.1 `propulsion` + A7, A9). */
export interface Propulsion {
  thrustCurve: ThrustCurve;
  ispSeaLevelS: number;
  ispVacuumS: number;
  gimbal: GimbalConfig;
  throttle: ThrottleConfig;
}

/** One row of the aero table (README §4.3 CSV column order). */
export interface AeroRow {
  mach: number;
  aoaDeg: number;
  CA: number;
  CN: number;
  Cm: number;
  CY: number;
  Cl: number;
  Cn: number;
  Clp: number;
  Cmq: number;
  Cnr: number;
}

/** Aerodynamic coefficients at a single (Mach, AoA) query point. */
export interface AeroCoeffs {
  CA: number;
  CN: number;
  Cm: number;
  CY: number;
  Cl: number;
  Cn: number;
  Clp: number;
  Cmq: number;
  Cnr: number;
}

/**
 * A parsed aero table on a rectangular (Mach × AoA) grid, ready for bilinear
 * interpolation (README §4.3). `machGrid`/`aoaGrid` are sorted ascending; `rows`
 * is indexed `rows[iMach][iAoa]`.
 */
export interface AeroTable {
  machGrid: number[];
  aoaGrid: number[];
  rows: AeroRow[][];
}

/** Aerodynamics configuration (README §8.1 `aero` + A11). */
export interface AeroConfig {
  table: AeroTable;
  /** Nominal center-of-pressure station from the nose, m. */
  cpFromNoseM: number;
}

/** Open-loop-ascent guidance parameters (README §4.6 mode 1). */
export interface AscentGuidanceConfig {
  /** Time to begin the pitch-over kick, s. */
  kickStartS: number;
  /** Duration of the pitch-over kick, s. */
  kickDurationS: number;
  /** Commanded pitch gimbal during the kick, rad. */
  kickDeflectionRad: number;
}

/**
 * Powered-descent guidance parameters (README §4.6 mode 3; plan Phase 4 + A7).
 * The landing engine is modelled as a constant rating `ratedThrustN` scaled by
 * throttle (A7: "descent thrust = rated thrust × throttle"); everything the
 * guidance law needs lives here — nothing is hardcoded (README §4.6).
 */
export interface DescentGuidanceConfig {
  /** Landing-engine thrust at full throttle, N (A7). */
  ratedThrustN: number;
  /** Suicide-burn trigger margin: ignite at h = v²/(2·a_max)·(1 + margin). */
  ignitionMargin: number;
  /** Terminal commanded descent rate v_td at h = 0, m/s (> 0, down). */
  touchdownSpeedMps: number;
  /** Tilt-command limit for the horizontal-position loop, rad. */
  maxTiltRad: number;
  /** Vertical-velocity-tracking PID → throttle (throttle per m/s). */
  pidVz: PidGains;
  /** Horizontal-position PID → tilt command (rad per m, rad per m/s). */
  pidPos: PidGains;
}

/** Landing target in local NED metres (README §8.1 `landing_target`, A14). */
export interface LandingTarget {
  northM: number;
  eastM: number;
  /** Touchdown acceptance limit on descent rate, m/s (README §10.2.4 gate). */
  touchdownVzMaxMps: number;
}

/**
 * Closed-loop attitude-control configuration (README §8.1 `control`, §4.6).
 * All gains and limits live here — nothing is hardcoded in the control loop.
 */
export interface ControlConfig {
  /** Pitch-channel PID gains (δp from θ error). */
  pidPitch: PidGains;
  /** Yaw-channel PID gains (δy from ψ error). */
  pidYaw: PidGains;
  /**
   * Roll-channel toggle (README §4.6): the MVP vehicle has no roll gimbal
   * authority (roll control would need differential surfaces or RCS), so this
   * is a stub — `AttitudeController` rejects `true`.
   */
  rollControlEnabled: boolean;
  /** Powered-descent guidance parameters (Phase 4); absent for ascent-only configs. */
  descent?: DescentGuidanceConfig;
  /** Landing target (defaults to the NED origin, touchdown limit 2 m/s). */
  landingTarget?: LandingTarget;
}

/** Fully-resolved rocket configuration (SI, radians; all data inlined). */
export interface RocketConfig {
  name: string;
  mass: MassConfig;
  geometry: Geometry;
  propulsion: Propulsion;
  aero: AeroConfig;
  guidance: AscentGuidanceConfig;
  /** Closed-loop attitude control (Phase 3+); absent for open-loop-only configs. */
  control?: ControlConfig;
}

// ---------------------------------------------------------------------------
// Controls, environment, telemetry
// ---------------------------------------------------------------------------

/** Gimbal + throttle command (README §4.4, §4.7). */
export interface GimbalCommand {
  /** Pitch gimbal deflection δp, rad. */
  deltaP: number;
  /** Yaw gimbal deflection δy, rad. */
  deltaY: number;
  /** Throttle fraction (0–1). */
  throttle: number;
}

/** Simulation environment (wind; atmosphere is taken from `@fds/atmosphere-models`). */
export interface RocketEnv {
  /** Altitude-varying wind profile in NED (default: still air). */
  wind?: WindProfile;
}

/** Instantaneous mass properties at a given propellant load (README §4.5). */
export interface MassProps {
  /** Total mass, kg. */
  m: number;
  /** Combined-vehicle CG station from the nose, m. */
  cgFromNose: number;
  /** Inertia tensor about the combined CG (diagonal), kg·m². */
  I: Mat3;
}

/** Per-timestep telemetry frame (README §4.7). */
export interface TelemetryFrame {
  t: number;
  r: Vec3;
  v: Vec3;
  /** Airspeed magnitude |V_rel|, m/s. */
  speed: number;
  mach: number;
  /** Angle of attack, rad. */
  alpha: number;
  /** Sideslip, rad. */
  beta: number;
  /** Dynamic pressure q̄, Pa. */
  qbar: number;
  /** Euler attitude (φ, θ, ψ), rad. */
  euler: { phi: number; theta: number; psi: number };
  omega: Vec3;
  mass: number;
  /** Static margin (X_cp − X_cg)/d_ref, calibers. */
  staticMargin: number;
  /** Commanded/actuated pitch gimbal δp, rad. */
  deltaP: number;
  /** Commanded/actuated yaw gimbal δy, rad. */
  deltaY: number;
  throttle: number;
  /** Altitude h = −r_NED.z, m. */
  altitude: number;
}

/** Landing metrics (README §4.7 "landing accuracy"; populated by `runLandingSim`). */
export interface LandingSummary {
  /** True when the run ended by ground contact (h ≤ 0), not the time cap. */
  touchedDown: boolean;
  /** Suicide-burn ignition time, s; `null` if the engine never lit. */
  ignitionTime: number | null;
  /** Descent rate at touchdown, m/s (+ down). */
  touchdownVz: number;
  /** Horizontal ground speed at touchdown, m/s. */
  touchdownLateralSpeed: number;
  /** Horizontal distance from the landing target at touchdown, m. */
  missDistance: number;
  /** Total (non-gravitational) load factor at touchdown, g. */
  touchdownG: number;
  /** Propellant consumed during the run, kg. */
  propellantUsedKg: number;
}

/** Summary metrics for a run (README §4.7). */
export interface RunSummary {
  /** Apogee altitude, m. */
  apogeeAltitude: number;
  /** Time of apogee, s. */
  apogeeTime: number;
  maxMach: number;
  /** Max dynamic pressure ("max-Q"), Pa. */
  maxQbar: number;
  /** Time of max-Q, s. */
  maxQbarTime: number;
  /** Peak axial load factor, g. */
  maxAxialG: number;
  /** Time of peak axial load factor, s (drives the §9 "max-g" chart marker). */
  maxAxialGTime: number;
  /** Peak lateral load factor, g. */
  maxLateralG: number;
  /** Time of peak lateral load factor, s. */
  maxLateralGTime: number;
  /** Burnout time (propellant exhausted), s; `null` if still burning at end. */
  burnoutTime: number | null;
  /** Total flight time simulated, s. */
  flightTime: number;
  /** Landing metrics (Phase 4); present only for `runLandingSim` runs. */
  landing?: LandingSummary;
}
