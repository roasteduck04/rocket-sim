/**
 * Reentry-module types (README §5, §8.2; plan Phase 5).
 *
 * State is the 3-DOF point-mass flight-path set over a rotating spherical
 * Earth (README §5.1), packed as a 6-element Float64Array for the shared
 * integrators. Heading ψ is measured from North, positive toward East
 * (plan A4 — consistent with the §5.1 φ̇/λ̇ equations as written).
 */

/** Flight-path state (README §5.1). Angles in rad, SI units. */
export interface ReentryState {
  /** Earth-relative velocity magnitude, m/s. */
  V: number;
  /** Flight-path angle, rad (negative = descending). */
  gamma: number;
  /** Heading, rad — 0 = due North, +π/2 = due East (plan A4). */
  psi: number;
  /** Geometric altitude above the spherical Earth surface, m. */
  h: number;
  /** Geocentric latitude, rad. */
  lat: number;
  /** Longitude, rad. */
  lon: number;
}

/** Number of state-vector elements. */
export const REENTRY_STATE_SIZE = 6;

/** Pack a {@link ReentryState} into the integrator's flat Float64Array. */
export const packReentryState = (s: ReentryState): Float64Array =>
  Float64Array.of(s.V, s.gamma, s.psi, s.h, s.lat, s.lon);

/** Unpack the integrator's flat state vector. */
export const unpackReentryState = (x: Float64Array): ReentryState => ({
  V: x[0],
  gamma: x[1],
  psi: x[2],
  h: x[3],
  lat: x[4],
  lon: x[5],
});

/** Structural/thermal limits binding the undershoot boundary (README §5.4). */
export interface ReentryLimits {
  /** Peak stagnation-point heat-flux limit, W/m². */
  maxHeatFluxWm2: number;
  /** Peak load-factor limit, g. */
  maxGLoad: number;
}

/** Reentry vehicle config (README §8.2). Fixed-trim capsule: constant Cd, L/D. */
export interface ReentryConfig {
  name: string;
  massKg: number;
  refAreaM2: number;
  /** Effective nose radius for Sutton–Graves heating, m. */
  noseRadiusM: number;
  /** Constant hypersonic drag coefficient (README §5.1 fixed-trim capsule). */
  cd: number;
  /** Hypersonic L/D; the lift coefficient is `cd · clOverCd`. */
  clOverCd: number;
  limits: ReentryLimits;
  /** Entry-interface altitude, m (skip-out datum, README §5.4). */
  entryInterfaceAltitudeM: number;
}

/**
 * Bank-angle profile σ(t, state), rad — the only real-time control input for a
 * lifting entry (README §5.1). A bare number means a constant bank.
 */
export type BankProfile = number | ((t: number, state: ReentryState) => number);

/** One recorded history sample (README §5.5 time histories). */
export interface ReentryFrame {
  t: number;
  V: number;
  gamma: number;
  psi: number;
  h: number;
  lat: number;
  lon: number;
  /** Air density at h, kg/m³. */
  rho: number;
  mach: number;
  /** Dynamic pressure, Pa. */
  qbar: number;
  /** Stagnation-point convective heat flux, W/m² (README §5.2). */
  qdotS: number;
  /**
   * Stagnation-point radiative heat flux, W/m² (Tauber–Sutton, Phase 7).
   * Zero unless the run enables `radiative` — and zero anyway below ~9 km/s.
   */
  qdotR: number;
  /** Load factor √(D²+L²)/(m·g0), g (README §5.3). */
  nLoad: number;
  /** Great-circle downrange from the entry point, m. */
  downrange: number;
  /** Bank angle applied at this sample, rad. */
  bank: number;
}

/** Why the run stopped. */
export type TerminationReason =
  /** Reached the ground (h ≤ 0). */
  | 'landed'
  /** Post-perigee climb back above the entry-interface altitude (plan A4). */
  | 'skipped'
  /** A configured limit was exceeded with `terminateOnLimits` enabled. */
  | 'limit-exceeded'
  /** Hit the `maxTime` cap without any other event. */
  | 'timeout';

/** Summary peaks & totals (README §5.5). */
export interface ReentryPeaks {
  /** Peak stagnation-point heat flux, W/m². */
  qdotSMax: number;
  /** Time of peak heat flux, s. */
  tAtQdotSMax: number;
  /** Integrated CONVECTIVE heat load ∫q̇ₛ dt, J/m² (README §5.2). */
  qTotalJm2: number;
  /** Peak radiative heat flux, W/m² (Phase 7; 0 with radiative off). */
  qdotRMax: number;
  /** Integrated radiative heat load ∫q̇_r dt, J/m² (Phase 7; 0 when off). */
  qRadTotalJm2: number;
  /**
   * Peak TOTAL (convective + radiative) heat flux, W/m². Equals `qdotSMax`
   * with radiative off; with it on, this is what the §8.2 heat-flux limit
   * (and hence the undershoot boundary) is checked against.
   */
  qdotTotalMax: number;
  /** Peak load factor, g. */
  nMax: number;
  /** Time of peak load factor, s. */
  tAtNMax: number;
  /** Final great-circle downrange from the entry point, m. */
  downrangeM: number;
  /** Total simulated flight time, s. */
  flightTimeS: number;
  /** Speed at termination, m/s (logs the A4 secondary super-orbital check). */
  speedAtTerminationMps: number;
  /** True when a peak exceeded the configured §8.2 limits. */
  limitsExceeded: boolean;
  terminationReason: TerminationReason;
}

/** A complete simulated reentry (README §5.5). */
export interface ReentryRun {
  history: ReentryFrame[];
  peaks: ReentryPeaks;
}

/** Corridor boundary curves over an entry-velocity sweep (README §5.4). */
export interface CorridorCurve {
  /** Entry velocities, m/s. */
  vEntry: number[];
  /** Shallowest allowable γ_entry per velocity (skip-out boundary), rad. */
  gammaOvershoot: number[];
  /** Steepest allowable γ_entry per velocity (burn-up boundary), rad. */
  gammaUndershoot: number[];
}
