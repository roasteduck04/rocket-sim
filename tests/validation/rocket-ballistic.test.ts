/**
 * README §10.2.1 — a zero-thrust, zero-drag point mass in gravity must trace the
 * closed-form parabola `r(t) = r0 + v0·t + ½·g·t²`. This validates the RK4
 * integrator + gravity term + body↔NED kinematics in isolation. The vehicle is
 * launched with identity attitude (body axes aligned with NED), so body velocity
 * maps straight to NED and gravity acts purely on +Down; the toss stays low
 * enough that the inverse-square gravity variation is negligible.
 */
import { describe, it, expect } from 'vitest';
import { runRocketSim, loadAeroTable, loadThrustCurve } from '@fds/rocket-sim';
import type { RocketConfig, RocketState } from '@fds/rocket-sim';
import { G0, qidentity } from '@fds/physics-core';

const zeroAero = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
);

const cfg: RocketConfig = {
  name: 'ballistic-point-mass',
  mass: {
    dryKg: 1000,
    propellantKg: 0, // no propellant → constant mass, no thrust
    dryCgFromNoseM: 2.5,
    propellantCgFromNoseM: 2.5,
    tankBottomFromNoseM: 3,
    tankRadiusM: 0.5,
    dryInertiaKgm2: { Ixx: 100, Iyy: 1000, Izz: 1000 },
  },
  geometry: { lengthM: 5, diameterM: 1, refAreaM2: 0.785 },
  propulsion: {
    thrustCurve: loadThrustCurve('0,0\n1,0'),
    ispSeaLevelS: 200,
    ispVacuumS: 200,
    gimbal: { maxDeflectionRad: 0.1, maxSlewRateRps: 1, positionFromNoseM: 4.5 },
    throttle: { min: 0, max: 1 },
  },
  aero: { table: zeroAero, cpFromNoseM: 3 },
  guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
};

// Launch: 30 m/s North + 40 m/s up (v_NED.z negative = up).
const v0 = { x: 30, y: 0, z: -40 };
const initialState: RocketState = {
  r: { x: 0, y: 0, z: 0 },
  v: { ...v0 },
  q: qidentity(),
  omega: { x: 0, y: 0, z: 0 },
  mass: 1000,
};

const guidance = { command: () => ({ deltaP: 0, deltaY: 0, throttle: 0 }) };

const { telemetry } = runRocketSim(cfg, guidance, {
  initialState,
  dt: 0.01,
  maxTime: 8,
  groundConstraint: false,
});

const frameAt = (t: number) => {
  let best = telemetry[0];
  for (const f of telemetry) if (Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  return best;
};

// Closed-form parabola in NED with uniform g = g0.
const analytic = (t: number) => ({
  x: v0.x * t,
  y: 0,
  z: v0.z * t + 0.5 * G0 * t * t,
});

describe('ballistic point mass matches the closed-form parabola (README §10.2.1)', () => {
  for (const t of [1, 2, 3, 4, 6, 8]) {
    it(`position at t≈${t}s`, () => {
      const f = frameAt(t);
      const a = analytic(f.t);
      expect(f.r.x).toBeCloseTo(a.x, 3);
      expect(f.r.y).toBeCloseTo(a.y, 6);
      expect(f.r.z).toBeCloseTo(a.z, 1); // tolerance absorbs the inverse-square g variation over the arc
    });
  }

  it('apogee altitude matches v0²/(2g) closed form', () => {
    const hApogee = (v0.z * v0.z) / (2 * G0);
    // summary apogee is tracked over the run; compare to analytic peak.
    const peak = Math.max(...telemetry.map((f) => f.altitude));
    expect(peak).toBeCloseTo(hApogee, 1);
  });
});
