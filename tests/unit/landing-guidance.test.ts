/**
 * Powered-descent (suicide-burn) guidance law, unit level (README §4.6 mode 3).
 *
 * Covers the guidance state machine in isolation — synthetic states fed
 * straight into `command(t, s)`:
 *   - coast (engine off) while above the ignition altitude,
 *   - ignition at h ≤ v²/(2·a_max)·(1 + margin), latched once lit,
 *   - throttle kept inside the config band during the burn,
 *   - horizontal-position errors → tilt commands with the Phase-3 sign closure,
 *   - more throttle when falling faster than the commanded profile.
 * Closed-loop touchdown behaviour is validated end-to-end in
 * tests/validation/rocket-landing.test.ts (§10.2.4).
 */
import { describe, it, expect } from 'vitest';
import {
  loadAeroTable,
  loadThrustCurve,
  poweredDescentGuidance,
} from '@fds/rocket-sim';
import type { RocketConfig, RocketState } from '@fds/rocket-sim';
import { qfromEuler321, rotateNEDtoBody } from '@fds/physics-core';
import type { Vec3 } from '@fds/physics-core';

const zeroAero = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
);

const RATED_N = 50000;
const MARGIN = 0.3;

const cfg: RocketConfig = {
  name: 'landing-guidance-test',
  mass: {
    dryKg: 2200,
    propellantKg: 8800,
    dryCgFromNoseM: 6.1,
    propellantCgFromNoseM: 4.8,
    tankBottomFromNoseM: 8.8,
    tankRadiusM: 0.6,
    dryInertiaKgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 },
  },
  geometry: { lengthM: 12, diameterM: 1.2, refAreaM2: 1.131 },
  propulsion: {
    thrustCurve: loadThrustCurve(`0,${RATED_N}\n1000,${RATED_N}`),
    ispSeaLevelS: 282,
    ispVacuumS: 311,
    gimbal: { maxDeflectionRad: 0.1047, maxSlewRateRps: 0.349, positionFromNoseM: 11.8 },
    throttle: { min: 0.4, max: 1.0 },
  },
  aero: { table: zeroAero, cpFromNoseM: 5.4 },
  guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
  control: {
    pidPitch: { kp: 0.8, ki: 0.05, kd: 0.6 },
    pidYaw: { kp: 0.8, ki: 0.05, kd: 0.6 },
    rollControlEnabled: false,
    descent: {
      ratedThrustN: RATED_N,
      ignitionMargin: MARGIN,
      touchdownSpeedMps: 1.0,
      maxTiltRad: 0.1396, // 8°
      pidVz: { kp: 0.15, ki: 0.05, kd: 0 },
      pidPos: { kp: 0.004, ki: 0, kd: 0.03 },
    },
    landingTarget: { northM: 0, eastM: 0, touchdownVzMaxMps: 2.0 },
  },
};

const noseUp = qfromEuler321(0, Math.PI / 2, 0);

/** Descending state: altitude h, NED velocity vNED, optional NED offset. */
const descending = (h: number, vNED: Vec3, north = 0, east = 0, mass = 3000): RocketState => ({
  r: { x: north, y: east, z: -h },
  v: rotateNEDtoBody(noseUp, vNED),
  q: noseUp,
  omega: { x: 0, y: 0, z: 0 },
  mass,
});

// a_max = T_max/m − g ≈ 50000/3000 − 9.81 ≈ 6.86 m/s²; at 50 m/s the ignition
// altitude is 50²/(2·6.86)·1.3 ≈ 237 m.

describe('poweredDescentGuidance (README §4.6 mode 3)', () => {
  it('throws when the config has no descent guidance block', () => {
    const { control, ...rest } = cfg;
    expect(() =>
      poweredDescentGuidance({
        ...rest,
        control: control && { ...control, descent: undefined },
      }),
    ).toThrow(/descent/);
  });

  it('coasts engine-off above the ignition altitude', () => {
    const g = poweredDescentGuidance(cfg);
    const out = g.command(0, descending(3000, { x: 0, y: 0, z: 50 }));
    expect(out.throttle).toBe(0);
    expect(out.deltaP).toBe(0);
    expect(out.deltaY).toBe(0);
    expect(g.ignitionTime).toBeNull();
  });

  it('ignites at h ≤ v²/(2·a_max)·(1+margin) and reports the ignition time', () => {
    const g = poweredDescentGuidance(cfg);
    expect(g.command(0, descending(300, { x: 0, y: 0, z: 50 })).throttle).toBe(0); // above 237 m
    const out = g.command(0.01, descending(230, { x: 0, y: 0, z: 50 }));
    expect(out.throttle).toBeGreaterThan(0);
    expect(g.ignitionTime).toBe(0.01);
  });

  it('keeps the throttle inside the config band while burning', () => {
    const g = poweredDescentGuidance(cfg);
    // Ignite, then feed a spread of on/off-profile states.
    let t = 0;
    for (const [h, vz] of [
      [230, 50],
      [180, 48],
      [100, 60], // far too fast → wants max thrust
      [50, 5], // far too slow → wants min thrust
      [5, 1],
    ] as const) {
      const out = g.command(t, descending(h, { x: 0, y: 0, z: vz }));
      if (g.ignitionTime !== null) {
        expect(out.throttle).toBeGreaterThanOrEqual(cfg.propulsion.throttle.min);
        expect(out.throttle).toBeLessThanOrEqual(cfg.propulsion.throttle.max);
      }
      t += 0.01;
    }
  });

  it('stays lit once ignited even when the trigger condition clears', () => {
    const g = poweredDescentGuidance(cfg);
    g.command(0, descending(230, { x: 0, y: 0, z: 50 })); // ignites
    // 5 m/s at 150 m is far above its own trigger (~2.4 m) — must stay lit.
    const out = g.command(0.01, descending(150, { x: 0, y: 0, z: 5 }));
    expect(out.throttle).toBeGreaterThanOrEqual(cfg.propulsion.throttle.min);
  });

  it('tilts the nose toward a northward target offset (−δp at this attitude)', () => {
    const g = poweredDescentGuidance(cfg);
    // Vehicle 100 m south of the target: nose (thrust) must tilt North. At
    // q = qfromEuler321(0, 90°, 0) body Z points North → pitch-down (−δp).
    g.command(0, descending(230, { x: 0, y: 0, z: 50 }, -100));
    const out = g.command(0.01, descending(228, { x: 0, y: 0, z: 50 }, -100));
    expect(out.deltaP).toBeLessThan(0);
    expect(out.deltaY).toBeCloseTo(0, 12);
  });

  it('tilts the nose toward an eastward target offset (+δy)', () => {
    const g = poweredDescentGuidance(cfg);
    g.command(0, descending(230, { x: 0, y: 0, z: 50 }, 0, -100));
    const out = g.command(0.01, descending(228, { x: 0, y: 0, z: 50 }, 0, -100));
    expect(out.deltaY).toBeGreaterThan(0);
    expect(out.deltaP).toBeCloseTo(0, 12);
  });

  it('commands more throttle when falling faster than the profile', () => {
    const mkRun = (vzAt100: number): number => {
      const g = poweredDescentGuidance(cfg);
      g.command(0, descending(230, { x: 0, y: 0, z: 50 }));
      return g.command(0.01, descending(100, { x: 0, y: 0, z: vzAt100 })).throttle;
    };
    expect(mkRun(60)).toBeGreaterThan(mkRun(30));
  });
});
