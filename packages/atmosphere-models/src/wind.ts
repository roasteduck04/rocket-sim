/**
 * Altitude-varying wind profiles (README §3.2). The returned vector is in NED
 * and is added to freestream velocity before α, β, and q̄ are computed.
 */

import { vadd, vsub, vscale, type Vec3 } from '@fds/physics-core';

export type WindProfile =
  | { kind: 'constant'; velocity: Vec3 }
  | { kind: 'shear'; base: Vec3; gradient: Vec3; refAltitude?: number }
  | { kind: 'table'; altitudes: number[]; velocities: Vec3[] };

const interpTable = (
  altitudes: number[],
  velocities: Vec3[],
  h: number,
): Vec3 => {
  const n = altitudes.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };
  if (n === 1 || h <= altitudes[0]) return velocities[0];
  if (h >= altitudes[n - 1]) return velocities[n - 1];

  // altitudes assumed sorted ascending; find the bracketing pair.
  let hi = 1;
  while (hi < n && altitudes[hi] < h) hi++;
  const lo = hi - 1;
  const span = altitudes[hi] - altitudes[lo];
  const t = span === 0 ? 0 : (h - altitudes[lo]) / span;
  return vadd(velocities[lo], vscale(vsub(velocities[hi], velocities[lo]), t));
};

export const windAtAltitude = (profile: WindProfile, h: number): Vec3 => {
  switch (profile.kind) {
    case 'constant':
      return profile.velocity;
    case 'shear': {
      const h0 = profile.refAltitude ?? 0;
      return vadd(profile.base, vscale(profile.gradient, h - h0));
    }
    case 'table':
      return interpTable(profile.altitudes, profile.velocities, h);
  }
};
