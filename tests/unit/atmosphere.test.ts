import { describe, it, expect } from 'vitest';
import { GAMMA_AIR, R_AIR, vec3 } from '@fds/physics-core';
import {
  atmosphere,
  us76Atmosphere,
  exponentialExtension,
  geometricToGeopotential,
  HANDOFF_ALTITUDE_M,
  windAtAltitude,
  type WindProfile,
} from '@fds/atmosphere-models';

const R0_US76 = 6_356_766;
const geopotentialToGeometric = (H: number): number => (R0_US76 * H) / (R0_US76 - H);
const relDiff = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('US Standard Atmosphere 1976', () => {
  // Published US76 reference values (temperature is molecular temperature).
  // The public API takes GEOMETRIC altitude; the small geometric↔geopotential
  // offset at 11/47 km is absorbed by the tolerance bands below.
  const cases = [
    { h: 0, T: 288.15, p: 101325, rho: 1.225, a: 340.3 },
    { h: 5000, T: 255.65, p: 54048, rho: 0.7364, a: 320.5 },
    { h: 11000, T: 216.65, p: 22632, rho: 0.3639, a: 295.1 },
    { h: 20000, T: 216.65, p: 5474.9, rho: 0.08803, a: 295.1 },
    { h: 47000, T: 270.65, p: 110.91, rho: 0.001427, a: 329.8 },
    { h: 80000, T: 198.64, p: 1.0524, rho: 1.846e-5, a: 282.5 },
  ];

  it('spot-checks match published tables within tolerance', () => {
    for (const c of cases) {
      const s = atmosphere(c.h);
      expect(Math.abs(s.T - c.T), `T at ${c.h} m`).toBeLessThan(2.0);
      expect(relDiff(s.p, c.p), `p at ${c.h} m`).toBeLessThan(0.06);
      expect(relDiff(s.rho, c.rho), `rho at ${c.h} m`).toBeLessThan(0.06);
      expect(Math.abs(s.a - c.a), `a at ${c.h} m`).toBeLessThan(3.0);
      expect(s.inVacuum).toBe(false);
    }
  });

  it('speed of sound satisfies a = √(γ·R·T)', () => {
    for (const h of [0, 10000, 30000, 60000]) {
      const s = atmosphere(h);
      expect(s.a).toBeCloseTo(Math.sqrt(GAMMA_AIR * R_AIR * s.T), 9);
    }
  });

  it('geopotential altitude is below geometric and vanishes at the surface', () => {
    expect(geometricToGeopotential(0)).toBeCloseTo(0, 12);
    expect(geometricToGeopotential(50000)).toBeLessThan(50000);
  });

  it('temperature and pressure are continuous across every layer boundary', () => {
    for (const H of [11000, 20000, 32000, 47000, 51000, 71000]) {
      const hb = geopotentialToGeometric(H);
      const below = atmosphere(hb - 1);
      const above = atmosphere(hb + 1);
      expect(relDiff(above.T, below.T), `T continuity @ H=${H}`).toBeLessThan(1e-3);
      expect(relDiff(above.p, below.p), `p continuity @ H=${H}`).toBeLessThan(1e-3);
    }
  });

  it('pressure decreases monotonically with altitude', () => {
    const alts = [0, 5000, 11000, 20000, 32000, 47000, 60000, 80000, 90000, 120000];
    let prev = Infinity;
    for (const h of alts) {
      const p = atmosphere(h).p;
      expect(p).toBeLessThan(prev);
      prev = p;
    }
  });
});

describe('exponential extension & 86 km handoff', () => {
  it('density is continuous across the 86 km handoff', () => {
    // Exponential model is anchored to US76 at the handoff altitude.
    const boundaryRho = us76Atmosphere(HANDOFF_ALTITUDE_M).rho;
    expect(relDiff(exponentialExtension(HANDOFF_ALTITUDE_M).rho, boundaryRho)).toBeLessThan(1e-9);

    const below = atmosphere(HANDOFF_ALTITUDE_M - 1);
    const above = atmosphere(HANDOFF_ALTITUDE_M + 1);
    expect(relDiff(above.rho, below.rho)).toBeLessThan(0.01);
  });

  it('flags vacuum only once density drops below the threshold', () => {
    expect(atmosphere(50000).inVacuum).toBe(false);
    expect(atmosphere(100000).inVacuum).toBe(false); // ρ ≈ 5e-7 kg/m³
    expect(atmosphere(200000).inVacuum).toBe(true); // ρ ≪ 1e-9 kg/m³
  });

  it('honors a custom vacuum threshold', () => {
    expect(atmosphere(100000, { vacuumThreshold: 1e-3 }).inVacuum).toBe(true);
  });
});

describe('wind profiles', () => {
  it('constant profile returns its velocity at any altitude', () => {
    const p: WindProfile = { kind: 'constant', velocity: vec3(5, -2, 0) };
    expect(windAtAltitude(p, 1234)).toEqual(vec3(5, -2, 0));
  });

  it('linear-shear profile scales with altitude above the reference', () => {
    const p: WindProfile = {
      kind: 'shear',
      base: vec3(0, 0, 0),
      gradient: vec3(0.01, 0, 0),
      refAltitude: 0,
    };
    expect(windAtAltitude(p, 1000).x).toBeCloseTo(10, 12);
  });

  it('table profile interpolates and clamps at the ends', () => {
    const p: WindProfile = {
      kind: 'table',
      altitudes: [0, 1000, 2000],
      velocities: [vec3(0, 0, 0), vec3(10, 0, 0), vec3(20, 0, 0)],
    };
    expect(windAtAltitude(p, 500).x).toBeCloseTo(5, 12);
    expect(windAtAltitude(p, 1000).x).toBeCloseTo(10, 12);
    expect(windAtAltitude(p, -100).x).toBeCloseTo(0, 12); // clamp low
    expect(windAtAltitude(p, 3000).x).toBeCloseTo(20, 12); // clamp high
  });
});
