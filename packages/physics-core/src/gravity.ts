/** Gravity model (README §3.3). */

import { G0, J2_EARTH, MU_EARTH, RE } from './constants.js';
import { type Vec3 } from './vec3.js';

/**
 * Inverse-square gravitational acceleration magnitude at geometric altitude `h`
 * (m/s²): g(h) = g0·(Re/(Re+h))². Points along +Down in the local NED frame.
 */
export const gravityAtAltitude = (h: number): number => {
  const ratio = RE / (RE + h);
  return G0 * ratio * ratio;
};

/**
 * J2 oblateness perturbation acceleration (README §3.3 optional toggle,
 * Phase 7) at Earth-centered position `r` with z along the spin axis (the
 * gravity field is axisymmetric, so ECI and ECEF are interchangeable here).
 * Returns ONLY the perturbation — add the central term −μ·r̂/|r|² separately.
 *
 *   a_J2 = −(3/2)·J2·μ·Re²/r⁵ · [ x(1 − 5z²/r²),
 *                                  y(1 − 5z²/r²),
 *                                  z(3 − 5z²/r²) ]
 *
 * (gradient of the J2 term of the geopotential; Vallado §8.6.1.)
 */
export const j2Acceleration = (r: Vec3): Vec3 => {
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  const rn = Math.sqrt(r2);
  const k = (-1.5 * J2_EARTH * MU_EARTH * RE * RE) / (r2 * r2 * rn);
  const z2r2 = (r.z * r.z) / r2;
  return {
    x: k * r.x * (1 - 5 * z2r2),
    y: k * r.y * (1 - 5 * z2r2),
    z: k * r.z * (3 - 5 * z2r2),
  };
};

/**
 * Local gravity components at geometric altitude `h` and geocentric latitude
 * `lat` (rad), resolved in the local NED triad (README §3.3 + Phase 7).
 */
export interface GravityNED {
  /** +Down (radially inward) component, m/s². */
  down: number;
  /** +North component, m/s² (J2 pulls toward the equator: < 0 for lat > 0). */
  north: number;
}

/**
 * Gravity in local NED at (h, lat), with the J2 oblateness term optional
 * (README §3.3: "a toggle, not a requirement"). With `j2 = false` this is
 * exactly {@link gravityAtAltitude} pointing down. With `j2 = true`, from the
 * geopotential U = μ/r − μ·J2·Re²·(3sin²φ − 1)/(2r³):
 *
 *   g_down  = μ/r²·[1 − (3/2)·J2·(Re/r)²·(3sin²φ − 1)]
 *   g_north = −3·μ·J2·Re²·sinφ·cosφ / r⁴
 *
 * (stronger than spherical at the equator, weaker at the poles, tangential
 * component toward the equator — the standard oblateness signature).
 */
export const gravityNED = (h: number, lat: number, j2: boolean): GravityNED => {
  if (!j2) return { down: gravityAtAltitude(h), north: 0 };
  const r = RE + h;
  const mur2 = MU_EARTH / (r * r);
  const re_r = RE / r;
  const j2r2 = J2_EARTH * re_r * re_r;
  const s = Math.sin(lat);
  const c = Math.cos(lat);
  return {
    down: mur2 * (1 - 1.5 * j2r2 * (3 * s * s - 1)),
    north: -3 * mur2 * j2r2 * s * c,
  };
};
