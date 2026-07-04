/**
 * Auxiliary per-sample outputs (README §5.2/§5.3/§5.5; plan Phase 5).
 *
 * Heat flux, load factor, dynamic pressure, Mach, and great-circle downrange
 * from the entry point. Pure functions of the state — the sim driver calls
 * this once per accepted step for history/peak tracking.
 */

import { G0, RE } from '@fds/physics-core';
import { suttonGraves } from './heating.js';
import { reentryForces } from './deriv.js';
import type { ReentryConfig, ReentryState } from './types.js';

/** Fixed geodetic reference for downrange measurement. */
export interface EntryPoint {
  /** Latitude, rad. */
  lat: number;
  /** Longitude, rad. */
  lon: number;
}

/** Aux quantities derived from a state sample. */
export interface AuxOutputs {
  /** Stagnation-point heat flux, W/m² (README §5.2). */
  qdotS: number;
  /** Load factor √(D²+L²)/(m·g0), g (README §5.3). */
  nLoad: number;
  /** Dynamic pressure, Pa. */
  qbar: number;
  mach: number;
  /** Great-circle surface downrange from the entry point, m. */
  downrange: number;
  /** Air density at h, kg/m³. */
  rho: number;
}

/** Great-circle surface distance between two lat/lon points, m (haversine). */
export const greatCircleDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const sdLat = Math.sin((lat2 - lat1) / 2);
  const sdLon = Math.sin((lon2 - lon1) / 2);
  const a = sdLat * sdLat + Math.cos(lat1) * Math.cos(lat2) * sdLon * sdLon;
  return 2 * RE * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Compute the README §5.5 auxiliary outputs for one state sample. */
export const auxOutputs = (
  s: ReentryState,
  cfg: ReentryConfig,
  entry: EntryPoint,
): AuxOutputs => {
  const f = reentryForces(s, cfg);
  return {
    qdotS: suttonGraves(f.rho, s.V, cfg.noseRadiusM),
    nLoad: Math.hypot(f.D, f.L) / (cfg.massKg * G0),
    qbar: f.qbar,
    mach: f.mach,
    downrange: greatCircleDistance(entry.lat, entry.lon, s.lat, s.lon),
    rho: f.rho,
  };
};
