/**
 * README §4.3 — aero table ingestion, bilinear interpolation, and the α/β sign
 * conventions. Interpolation must be exact on grid nodes and correct at interior
 * points; queries off the grid clamp to the edges. `α = atan2(w, u)` and
 * `β = asin(v/|V|)` must carry the right sign.
 */
import { describe, it, expect } from 'vitest';
import { loadAeroTable, interpAero, aeroForcesMoments } from '@fds/rocket-sim';
import type { AeroConfig, Geometry } from '@fds/rocket-sim';
import { atmosphere } from '@fds/atmosphere-models';

const CSV = [
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr',
  '0,0,0.3,0.0,0,0,0,0,-0.5,-4,-4',
  '0,10,0.3,0.4,0,0,0,0,-0.5,-4,-4',
  '2,0,0.5,0.0,0,0,0,0,-0.5,-3,-3',
  '2,10,0.5,0.5,0,0,0,0,-0.5,-3,-3',
].join('\n');

const table = loadAeroTable(CSV);

describe('loadAeroTable', () => {
  it('builds the (Mach × AoA) grid', () => {
    expect(table.machGrid).toEqual([0, 2]);
    expect(table.aoaGrid).toEqual([0, 10]);
  });
  it('rejects a ragged / incomplete grid', () => {
    expect(() =>
      loadAeroTable('Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n2,0,0,0,0,0,0,0,0,0,0'),
    ).toThrow(/missing node/);
  });
});

describe('interpAero is exact on grid nodes', () => {
  it('returns node values verbatim', () => {
    expect(interpAero(table, 0, 0).CN).toBeCloseTo(0.0, 12);
    expect(interpAero(table, 0, 10).CN).toBeCloseTo(0.4, 12);
    expect(interpAero(table, 2, 10).CN).toBeCloseTo(0.5, 12);
    expect(interpAero(table, 2, 0).CA).toBeCloseTo(0.5, 12);
  });
});

describe('interpAero interior + edge clamp', () => {
  it('bilinearly blends CN at the grid center', () => {
    // corners CN: (0,0)=0 (0,10)=0.4 (2,0)=0 (2,10)=0.5 → center = 0.225
    expect(interpAero(table, 1, 5).CN).toBeCloseTo(0.225, 12);
    // CA depends on Mach only here: (0.3, 0.5) → 0.4 at Mach 1
    expect(interpAero(table, 1, 5).CA).toBeCloseTo(0.4, 12);
  });
  it('clamps queries outside the grid to the edges', () => {
    expect(interpAero(table, -5, 0).CN).toBeCloseTo(interpAero(table, 0, 0).CN, 12);
    expect(interpAero(table, 99, 10).CN).toBeCloseTo(interpAero(table, 2, 10).CN, 12);
    expect(interpAero(table, 0, 50).CN).toBeCloseTo(interpAero(table, 0, 10).CN, 12);
  });
});

describe('angle-of-attack / sideslip sign conventions', () => {
  const geom: Geometry = { lengthM: 5, diameterM: 1, refAreaM2: 0.785 };
  const aero: AeroConfig = { table, cpFromNoseM: 3 };
  const atmo = atmosphere(0);
  const base = { windBody: { x: 0, y: 0, z: 0 }, omega: { x: 0, y: 0, z: 0 }, rho: atmo.rho, a: atmo.a, cgFromNose: 3 };

  it('α = atan2(w, u): positive w gives positive α', () => {
    const pos = aeroForcesMoments(geom, aero, { ...base, vBody: { x: 200, y: 0, z: 20 } });
    const neg = aeroForcesMoments(geom, aero, { ...base, vBody: { x: 200, y: 0, z: -20 } });
    expect(pos.alpha).toBeGreaterThan(0);
    expect(neg.alpha).toBeLessThan(0);
    expect(pos.alpha).toBeCloseTo(-neg.alpha, 12);
  });
  it('β = asin(v/|V|): positive lateral velocity gives positive β', () => {
    const pos = aeroForcesMoments(geom, aero, { ...base, vBody: { x: 200, y: 20, z: 0 } });
    expect(pos.beta).toBeGreaterThan(0);
  });
});
