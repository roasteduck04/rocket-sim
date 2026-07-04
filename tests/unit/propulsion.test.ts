/**
 * README §4.4 / plan A9 — thrust-curve ingestion, pressure-blended Isp, derived
 * mass flow, and the propellant-exhaustion cutoff. Thrust is 0 outside the
 * curve's span; `Isp(p)` blends between sea-level and vacuum values; `ṁ =
 * T/(g0·Isp)`; and once the propellant is gone `derivRocket` zeroes both thrust
 * and mass flow.
 */
import { describe, it, expect } from 'vitest';
import {
  loadThrustCurve,
  thrustCurveAt,
  ispAtPressure,
  thrustAt,
  loadAeroTable,
  derivRocket,
  packState,
  initialVerticalState,
} from '@fds/rocket-sim';
import type { Propulsion, RocketConfig } from '@fds/rocket-sim';
import { G0, P0_SL } from '@fds/physics-core';

const prop: Propulsion = {
  thrustCurve: loadThrustCurve('# t,thrust\n0,0\n0.5,1000\n10,1000\n11,0'),
  ispSeaLevelS: 280,
  ispVacuumS: 310,
  gimbal: { maxDeflectionRad: 0.1, maxSlewRateRps: 1, positionFromNoseM: 4 },
  throttle: { min: 0, max: 1 },
};

describe('thrust curve interpolation', () => {
  it('linearly interpolates between points', () => {
    expect(thrustCurveAt(prop.thrustCurve, 0.25)).toBeCloseTo(500, 9); // half of ramp
    expect(thrustCurveAt(prop.thrustCurve, 5)).toBeCloseTo(1000, 9);
  });
  it('is zero after the curve ends', () => {
    expect(thrustCurveAt(prop.thrustCurve, 11)).toBe(0);
    expect(thrustCurveAt(prop.thrustCurve, 50)).toBe(0);
  });
  it('parses .eng-style whitespace pairs and skips header/comment lines', () => {
    const eng = ';comment\nK550 54 410 5-10 0.5 1.0 Manufacturer\n0 0\n0.1 600\n1.0 400\n2.0 0';
    const c = loadThrustCurve(eng);
    expect(c.time).toEqual([0, 0.1, 1.0, 2.0]);
    expect(thrustCurveAt(c, 0.1)).toBeCloseTo(600, 9);
  });
  it('rejects non-increasing times', () => {
    expect(() => loadThrustCurve('0,0\n1,100\n0.5,50')).toThrow(/strictly increase/);
  });
});

describe('pressure-blended Isp (README §4.4)', () => {
  it('equals sea-level Isp at sea-level pressure', () => {
    expect(ispAtPressure(prop, P0_SL)).toBeCloseTo(280, 9);
  });
  it('equals vacuum Isp at zero pressure', () => {
    expect(ispAtPressure(prop, 0)).toBeCloseTo(310, 9);
  });
  it('blends linearly at half sea-level pressure', () => {
    expect(ispAtPressure(prop, P0_SL / 2)).toBeCloseTo(295, 9);
  });
});

describe('mass flow ṁ = T/(g0·Isp) (plan A9)', () => {
  it('derives ṁ from thrust and the local Isp', () => {
    const s = thrustAt(prop, 5, 0); // vacuum, T = 1000 N, Isp = 310
    expect(s.T).toBeCloseTo(1000, 9);
    expect(s.isp).toBeCloseTo(310, 9);
    expect(s.mdot).toBeCloseTo(1000 / (G0 * 310), 12);
  });
  it('∫ṁ dt over a constant-thrust segment matches impulse/(g0·Isp)', () => {
    // 1000 N held from t=0.5..10 at fixed pressure → ṁ constant.
    const p = 0;
    let acc = 0;
    const dt = 0.01;
    for (let t = 0.5; t < 10; t += dt) acc += thrustAt(prop, t, p).mdot * dt;
    const impulse = 1000 * (10 - 0.5);
    expect(acc).toBeCloseTo(impulse / (G0 * 310), 2);
  });
});

describe('propellant-exhaustion cutoff (derivRocket)', () => {
  const zeroAero = loadAeroTable(
    'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
  );
  const cfg: RocketConfig = {
    name: 'cutoff-probe',
    mass: {
      dryKg: 500,
      propellantKg: 100,
      dryCgFromNoseM: 3,
      propellantCgFromNoseM: 2.5,
      tankBottomFromNoseM: 4,
      tankRadiusM: 0.5,
      dryInertiaKgm2: { Ixx: 50, Iyy: 500, Izz: 500 },
    },
    geometry: { lengthM: 5, diameterM: 1, refAreaM2: 0.785 },
    propulsion: prop,
    aero: { table: zeroAero, cpFromNoseM: 3 },
    guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
  };
  const controls = { deltaP: 0, deltaY: 0, throttle: 1 };

  it('burns propellant while it lasts (ṁ < 0)', () => {
    const s = initialVerticalState(cfg); // full tank
    const xdot = derivRocket(5, packState(s), { cfg, controls, env: {} });
    expect(xdot[13]).toBeLessThan(0); // mass decreasing
  });
  it('zeroes mass flow once the tank is empty', () => {
    const empty = { ...initialVerticalState(cfg), mass: cfg.mass.dryKg };
    const xdot = derivRocket(5, packState(empty), { cfg, controls, env: {} });
    expect(xdot[13]).toBeCloseTo(0, 12); // no more propellant to burn (±0)
  });
});
