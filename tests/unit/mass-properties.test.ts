/**
 * README §4.5 / plan trap T1 — instantaneous mass properties as propellant
 * depletes. Verifies analytic CG and inertia at full / half / empty load, the
 * parallel-axis bookkeeping, and (the headline case) that the static margin
 * crosses zero DURING the burn: for the reference booster the CG starts forward
 * of the CP (stable) and ends aft of it (unstable) as the long propellant column
 * drains aft. A sim that froze the CG could never reproduce this.
 */
import { describe, it, expect } from 'vitest';
import { massProps } from '@fds/rocket-sim';
import type { MassConfig } from '@fds/rocket-sim';

// Reference TVC booster mass block (data/reference-tvc-booster.rocket.yaml).
const mass: MassConfig = {
  dryKg: 2200,
  propellantKg: 8800,
  dryCgFromNoseM: 6.1,
  propellantCgFromNoseM: 4.8,
  tankBottomFromNoseM: 8.8,
  tankRadiusM: 0.6,
  dryInertiaKgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 },
};

const CP = 5.4;
const D = 1.2;
const margin = (cg: number): number => (CP - cg) / D;

describe('massProps at full load', () => {
  const mp = massProps(mass, 8800);
  it('total mass is dry + propellant', () => {
    expect(mp.m).toBeCloseTo(11000, 9);
  });
  it('combined CG is the mass-weighted average (5.06 m)', () => {
    // (2200·6.1 + 8800·4.8)/11000
    expect(mp.cgFromNose).toBeCloseTo(5.06, 9);
  });
  it('axial inertia adds the propellant cylinder ½·m·r²', () => {
    // 450 + 0.5·8800·0.6² = 2034
    expect(mp.I[0]).toBeCloseTo(2034, 6);
  });
  it('transverse inertia matches the hand-computed parallel-axis sum', () => {
    // dry: 18500 + 2200·(6.1−5.06)² ; prop: 8800·(3r²+h²)/12 + 8800·(4.8−5.06)²
    expect(mp.I[4]).toBeCloseTo(69199.73, 1);
    expect(mp.I[8]).toBeCloseTo(69199.73, 1);
  });
});

describe('massProps at empty tank', () => {
  const mp = massProps(mass, 0);
  it('reduces to the dry structure about its own CG', () => {
    expect(mp.m).toBeCloseTo(2200, 9);
    expect(mp.cgFromNose).toBeCloseTo(6.1, 9);
    expect(mp.I[0]).toBeCloseTo(450, 9);
    expect(mp.I[4]).toBeCloseTo(18500, 9);
    expect(mp.I[8]).toBeCloseTo(18500, 9);
  });
  it('clamps negative propellant to empty (no sub-dry overshoot)', () => {
    const over = massProps(mass, -50);
    expect(over.cgFromNose).toBeCloseTo(6.1, 9);
    expect(over.m).toBeCloseTo(2200, 9);
  });
});

describe('massProps at half load', () => {
  const mp = massProps(mass, 4400);
  it('propellant column half height, CG at tank_bottom − h/2', () => {
    // h = 8·0.5 = 4 m ; cgProp = 8.8 − 2 = 6.8 ; combined = (2200·6.1+4400·6.8)/6600
    expect(mp.cgFromNose).toBeCloseTo(43340 / 6600, 6);
  });
});

describe('static margin crosses zero during the burn (trap T1)', () => {
  it('is positive (stable) at full load', () => {
    expect(margin(massProps(mass, 8800).cgFromNose)).toBeGreaterThan(0);
  });
  it('has gone negative (unstable) well before burnout', () => {
    // By 80% remaining the CG has already migrated aft of the CP.
    expect(margin(massProps(mass, 7000).cgFromNose)).toBeLessThan(0);
  });
  it('is negative at empty', () => {
    expect(margin(massProps(mass, 0).cgFromNose)).toBeLessThan(0);
  });
  it('there is a propellant load where the margin is (near) zero', () => {
    // Bisect for cg = CP between full and the known-negative point.
    let lo = 7000; // margin < 0
    let hi = 8800; // margin > 0
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const m = margin(massProps(mass, mid).cgFromNose);
      if (m > 0) hi = mid;
      else lo = mid;
    }
    const cgAtCross = massProps(mass, (lo + hi) / 2).cgFromNose;
    expect(cgAtCross).toBeCloseTo(CP, 3);
  });
});
