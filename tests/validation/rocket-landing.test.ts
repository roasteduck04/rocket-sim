/**
 * README §10.2.4 — Landing-burn guidance: touchdown vertical velocity must
 * converge below the configured `touchdown_vz_max_mps` across a range of
 * initial altitudes/velocities within the guidance law's designed capture
 * region, with bounded miss distance.
 *
 * The capture region of the suicide-burn trigger is `h₀ > v₀²·(1+margin)/
 * (2·a_max(m₀))`: below that line the vehicle is already past its own
 * ignition altitude at scenario start and cannot stop in the distance left
 * (verified by the deliberate outside-capture case at the end).
 *
 * Test vehicle = reference-booster masses/geometry with a ZERO-coefficient
 * aero table, following the Phase-3 §10.2.3 precedent: the shipped Barrowman
 * table covers the ascent domain (AoA 0–10°), and a tail-first descent flies
 * at α ≈ 180° where the table has no validity — so the test isolates
 * guidance + propulsion + gravity, which is what §10.2.4 gates on (see
 * docs/equations.md Phase 4, "modeling limitations"). The landing burn also
 * stresses plan trap T2 (gimbal arm/inertia recomputation) because the moment
 * arm changes fastest during this burn.
 */
import { describe, it, expect } from 'vitest';
import { loadAeroTable, loadThrustCurve, runLandingSim } from '@fds/rocket-sim';
import type { LandingScenario, RocketConfig } from '@fds/rocket-sim';

const zeroAero = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
);

const RATED_N = 50000;
const TOUCHDOWN_LIMIT = 2.0; // m/s, §8.1 landing_target.touchdown_vz_max_mps

const cfg: RocketConfig = {
  name: 'landing-validation',
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
    // Placeholder ascent curve — runLandingSim swaps in the constant
    // `rated_thrust_n` landing rating (plan A7).
    thrustCurve: loadThrustCurve(`0,210000\n150,210000`),
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
      ignitionMargin: 0.3,
      touchdownSpeedMps: 1.0,
      maxTiltRad: 0.1396, // 8°
      pidVz: { kp: 0.15, ki: 0.05, kd: 0 },
      pidPos: { kp: 0.004, ki: 0, kd: 0.03 },
    },
    landingTarget: { northM: 0, eastM: 0, touchdownVzMaxMps: TOUCHDOWN_LIMIT },
  },
};

const PROP_KG = 800; // landing-burn propellant load (m₀ = 3000 kg)

// Capture region at m₀ = 3000 kg: a_max = 50000/3000 − g ≈ 6.86 m/s² →
// h₀ must exceed v₀²·1.3/13.7 ≈ 0.095·v₀². All cases below satisfy it.
const sweep: Array<LandingScenario & { label: string }> = [
  { label: 'low & slow', altitudeM: 1500, descentRateMps: 50, propellantKg: PROP_KG },
  { label: 'low & moderate', altitudeM: 1500, descentRateMps: 100, propellantKg: PROP_KG },
  { label: 'mid & slow', altitudeM: 2000, descentRateMps: 50, propellantKg: PROP_KG },
  { label: 'mid & moderate', altitudeM: 2000, descentRateMps: 100, propellantKg: PROP_KG },
  { label: 'high & slow', altitudeM: 3000, descentRateMps: 50, propellantKg: PROP_KG },
  { label: 'high & moderate', altitudeM: 3000, descentRateMps: 100, propellantKg: PROP_KG },
  { label: 'high & fast', altitudeM: 3000, descentRateMps: 150, propellantKg: PROP_KG },
  {
    label: 'lateral offset south + eastward drift',
    altitudeM: 2000,
    descentRateMps: 100,
    northM: -60,
    vEastMps: 8,
    propellantKg: PROP_KG,
  },
  {
    label: 'lateral offset north-west',
    altitudeM: 2500,
    descentRateMps: 80,
    northM: 40,
    eastM: -50,
    propellantKg: PROP_KG,
  },
];

describe('landing-burn touchdown across the capture region (README §10.2.4)', () => {
  for (const sc of sweep) {
    describe(sc.label, () => {
      const { telemetry, summary } = runLandingSim(cfg, sc, { maxTime: 120 });
      const landing = summary.landing!;

      it('touches down (no hover, no crash-out of the run window)', () => {
        expect(landing.touchedDown).toBe(true);
        expect(landing.ignitionTime).toBeGreaterThan(0); // coasted first, then lit
      });

      it(`touchdown descent rate < ${TOUCHDOWN_LIMIT} m/s`, () => {
        expect(landing.touchdownVz).toBeGreaterThan(0); // still descending, not climbing
        expect(landing.touchdownVz).toBeLessThan(TOUCHDOWN_LIMIT);
      });

      it('lands near the target with small lateral velocity', () => {
        // Measured: worst miss 1.71 m / worst lateral 0.37 m/s (offset cases);
        // bounds leave ~3× headroom yet still fail on a broken lateral cascade.
        expect(landing.missDistance).toBeLessThan(5);
        expect(landing.touchdownLateralSpeed).toBeLessThan(1);
      });

      it('soft-landing loads, propellant margin, and actuator limits respected', () => {
        expect(landing.touchdownG).toBeLessThan(2.5); // measured ≈ 1.5 g
        expect(landing.propellantUsedKg).toBeLessThan(PROP_KG); // tank not dry
        for (const f of telemetry) {
          expect(Math.abs(f.deltaP)).toBeLessThanOrEqual(cfg.propulsion.gimbal.maxDeflectionRad + 1e-12);
          expect(Math.abs(f.deltaY)).toBeLessThanOrEqual(cfg.propulsion.gimbal.maxDeflectionRad + 1e-12);
          if (f.throttle > 0) {
            expect(f.throttle).toBeGreaterThanOrEqual(cfg.propulsion.throttle.min - 1e-12);
            expect(f.throttle).toBeLessThanOrEqual(cfg.propulsion.throttle.max + 1e-12);
          }
        }
      });
    });
  }

  it('outside the capture region the burn cannot arrest the fall (documents the boundary)', () => {
    // h₀ = 800 m at 150 m/s: full-throttle stopping distance is ≈ 1.4–1.6 km
    // even crediting the a_max growth from propellant depletion → hard impact
    // (measured ≈ 105 m/s). Note (1500 m, 150 m/s) — outside the trigger's
    // *design* region — still lands softly on best-effort max throttle for
    // exactly that depletion reason: the margin factor is conservative.
    const { summary } = runLandingSim(
      cfg,
      { altitudeM: 800, descentRateMps: 150, propellantKg: PROP_KG },
      { maxTime: 120 },
    );
    expect(summary.landing?.touchedDown).toBe(true);
    expect(summary.landing?.touchdownVz).toBeGreaterThan(TOUCHDOWN_LIMIT);
  });
});
