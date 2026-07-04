/**
 * README §10.2.2 — a vehicle with zero static margin (CP = CG) must be neutrally
 * stable in pitch: no restoring moment. Confirms the CP/CG moment bookkeeping.
 * Also checks the direction of the couple for positive and negative margins, and
 * (plan trap T4) that a positive pitch-gimbal deflection produces a nose-up
 * moment for the aft-mounted engine per README §4.4.
 */
import { describe, it, expect } from 'vitest';
import { aeroForcesMoments, loadAeroTable, thrustForceMoment } from '@fds/rocket-sim';
import type { AeroConfig, GimbalConfig, Geometry } from '@fds/rocket-sim';
import { atmosphere } from '@fds/atmosphere-models';

// Linear normal-force table, no static Cm (restoring is purely geometric).
const table = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0.3,0,0,0,0,0,0,0,0\n0,10,0.3,0.4,0,0,0,0,0,0,0\n3,0,0.3,0,0,0,0,0,0,0,0\n3,10,0.3,0.4,0,0,0,0,0,0,0',
);
const geom: Geometry = { lengthM: 5, diameterM: 1, refAreaM2: 0.785 };
const atmo = atmosphere(0);
// Positive angle of attack (w > 0 → α > 0), well within the table.
const base = {
  vBody: { x: 200, y: 0, z: 20 },
  windBody: { x: 0, y: 0, z: 0 },
  omega: { x: 0, y: 0, z: 0 },
  rho: atmo.rho,
  a: atmo.a,
};

const aeroAt = (cp: number, cg: number) =>
  aeroForcesMoments(geom, { table, cpFromNoseM: cp } as AeroConfig, { ...base, cgFromNose: cg });

describe('pitch stability from the static margin (README §10.2.2)', () => {
  it('zero static margin (CP = CG) → no pitch moment', () => {
    const r = aeroAt(5, 5);
    expect(r.staticMargin).toBeCloseTo(0, 12);
    expect(Math.abs(r.M.y)).toBeLessThan(1e-9);
  });

  it('positive static margin (CP aft of CG) → restoring (nose-down) moment at +α', () => {
    const r = aeroAt(5.2, 5.0);
    expect(r.staticMargin).toBeGreaterThan(0);
    expect(r.M.y).toBeLessThan(0); // opposes the +α perturbation
  });

  it('negative static margin (CP ahead of CG) → diverging (nose-up) moment at +α', () => {
    const r = aeroAt(4.8, 5.0);
    expect(r.staticMargin).toBeLessThan(0);
    expect(r.M.y).toBeGreaterThan(0); // reinforces the +α perturbation
  });

  it('moment magnitude scales with the CP–CG arm', () => {
    const near = aeroAt(5.1, 5.0);
    const far = aeroAt(5.3, 5.0);
    expect(Math.abs(far.M.y)).toBeGreaterThan(Math.abs(near.M.y));
  });
});

describe('gimbal pitch sign (plan trap T4, README §4.4)', () => {
  const gimbal: GimbalConfig = {
    maxDeflectionRad: 0.2,
    maxSlewRateRps: 1,
    positionFromNoseM: 9, // aft of the CG at 5 m
  };
  it('+δp produces a nose-up (positive) moment for the aft engine', () => {
    const { M } = thrustForceMoment(10000, 0.1, 0, 5, gimbal);
    expect(M.y).toBeGreaterThan(0);
  });
  it('−δp produces a nose-down (negative) moment', () => {
    const { M } = thrustForceMoment(10000, -0.1, 0, 5, gimbal);
    expect(M.y).toBeLessThan(0);
  });
});
