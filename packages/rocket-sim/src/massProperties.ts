/**
 * Instantaneous mass properties as propellant depletes (README §4.5, plan A5/A6).
 *
 * The propellant is a solid cylinder draining top-down: its column shrinks from
 * the top so the remaining slug collects at the tank bottom, and its CG migrates
 * aft as the tank empties. Both the dry structure (inertia given about the dry
 * CG, A6) and the propellant cylinder are parallel-axis transferred to the
 * instantaneous COMBINED CG every call — never frozen at t = 0 (trap T1).
 *
 * Cylinder inertia (radius r, height h, mass m): axial ½·m·r²; transverse
 * m·(3r² + h²)/12 about its own centroid.
 */

import { m3diag, type Mat3 } from '@fds/physics-core';
import type { MassConfig, MassProps } from './types.js';

/** Full-load propellant column height, m (from tank geometry + full CG, A5). */
const fullColumnHeight = (mass: MassConfig): number =>
  2 * (mass.tankBottomFromNoseM - mass.propellantCgFromNoseM);

/**
 * Mass, combined CG (station from nose), and inertia tensor (about the combined
 * CG) for a given remaining propellant mass `mProp` (kg, clamped at 0).
 */
export const massProps = (mass: MassConfig, mProp: number): MassProps => {
  const mDry = mass.dryKg;
  const mProp0 = mass.propellantKg;
  const dryCg = mass.dryCgFromNoseM;
  const { Ixx: dryIxx, Iyy: dryIyy, Izz: dryIzz } = mass.dryInertiaKgm2;

  const mp = Math.max(0, mProp);

  // No propellant (empty tank, or an aero/ballistic config with mProp0 = 0):
  // everything reduces to the dry structure about its own CG.
  if (mp <= 0 || mProp0 <= 0) {
    return {
      m: mDry + mp,
      cgFromNose: dryCg,
      I: m3diag(dryIxx, dryIyy, dryIzz),
    };
  }

  const r = mass.tankRadiusM;
  const hFull = fullColumnHeight(mass);
  const frac = mp / mProp0; // constant cross-section → height scales with mass
  const hCol = hFull * frac;
  // Column occupies [tankBottom − hCol, tankBottom]; CG at its midpoint.
  const cgProp = mass.tankBottomFromNoseM - hCol / 2;

  const m = mDry + mp;
  const cg = (mDry * dryCg + mp * cgProp) / m;

  // Axial: both dry and propellant are centered on the longitudinal axis, so no
  // parallel-axis term (offset is along the axis, not radial).
  const Ixx = dryIxx + 0.5 * mp * r * r;

  // Transverse: dry inertia (about dry CG) + propellant cylinder (about its own
  // centroid), each parallel-axis shifted to the combined CG.
  const dDry = dryCg - cg;
  const dProp = cgProp - cg;
  const IpropTrans = (mp * (3 * r * r + hCol * hCol)) / 12;
  const Iyy = dryIyy + mDry * dDry * dDry + IpropTrans + mp * dProp * dProp;
  const Izz = dryIzz + mDry * dDry * dDry + IpropTrans + mp * dProp * dProp;

  const I: Mat3 = m3diag(Ixx, Iyy, Izz);
  return { m, cgFromNose: cg, I };
};
