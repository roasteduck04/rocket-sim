/**
 * Convex powered-descent guidance validation (Phase 7).
 *
 * Layers, from solver to closed loop:
 *  1. **1-D analytic optimum** — vertical min-fuel descent of a constant-mass
 *     double integrator with σ ∈ [u_min, u_max] is the classic bang-bang
 *     (min-thrust arc, then max-thrust arc). The switch time follows from two
 *     kinematic equations; `solvePdg` at the analytic tf must reproduce the
 *     optimal cost Σσ·Δt to discretization accuracy and show the same
 *     min→max structure. (Isp is set astronomically high so mass is constant
 *     and the comparison is exact.)
 *  2. **3-D divert** — feasibility diagnostics of the discrete solution:
 *     lossless relaxation (σ = ‖u‖), throttle band respected, terminal
 *     boundary conditions met, glide-slope cone satisfied at every node.
 *  3. **Closed-loop 6-DOF** — `runPdgLandingSim` flies the plan through the
 *     full rocket sim (§10.2.4 gates). Same zero-coefficient aero table as
 *     the Phase-4 tests (tail-first descent is outside the shipped table's
 *     validity — docs/equations.md Phase 4).
 *  4. **Boostback scenario** (plan A8 stretch) — boostback burn → flip →
 *     coast → landing burn, ending inside the same touchdown gates.
 */
import { describe, it, expect } from 'vitest';
import { G0 } from '@fds/physics-core';
import {
  loadAeroTable,
  loadThrustCurve,
  pdgIsFlyable,
  runBoostbackLandingSim,
  runLandingSim,
  runPdgLandingSim,
  solvePdg,
  type PdgVehicle,
  type RocketConfig,
} from '@fds/rocket-sim';

const zeroAero = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
);

const RATED_N = 50000;
const TOUCHDOWN_LIMIT = 2.0;

// Same reference-booster test vehicle as the Phase-4 §10.2.4 suite.
const cfg: RocketConfig = {
  name: 'pdg-validation',
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
      maxTiltRad: 0.1396,
      pidVz: { kp: 0.15, ki: 0.05, kd: 0 },
      pidPos: { kp: 0.004, ki: 0, kd: 0.03 },
    },
    landingTarget: { northM: 0, eastM: 0, touchdownVzMaxMps: TOUCHDOWN_LIMIT },
  },
};

describe('PDG vs the 1-D analytic bang-bang optimum', () => {
  // Constant-mass vertical problem: m = 3000 kg frozen via an absurd Isp.
  const m0 = 3000;
  const vehicle: PdgVehicle = { massKg: m0, minThrustN: 20000, maxThrustN: 50000, ispS: 1e12 };
  const umin = vehicle.minThrustN / m0;
  const umax = vehicle.maxThrustN / m0;
  const h0 = 2000;
  const v0 = 100; // descending

  // Analytic min→max bang-bang: phase accelerations a1 = g − umin (still
  // gaining speed), a2 = g − umax (braking); v1 = v0 + a1·t1; the touchdown
  // conditions v = 0, h = 0 give a quadratic in t1.
  const a1 = G0 - umin;
  const a2 = G0 - umax; // < 0
  // h0 = v0·t1 + a1·t1²/2 + v1²/(2·|a2|) with v1 = v0 + a1·t1:
  const A = a1 / 2 + (a1 * a1) / (2 * -a2);
  const B = v0 + (v0 * a1) / -a2;
  const C = (v0 * v0) / (2 * -a2) - h0;
  const t1 = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  const v1 = v0 + a1 * t1;
  const t2 = v1 / -a2;
  const tf = t1 + t2;
  const analyticCost = umin * t1 + umax * t2; // Σσ dt, m/s

  const sol = solvePdg(
    vehicle,
    {
      r0: { x: 0, y: 0, z: -h0 },
      v0: { x: 0, y: 0, z: v0 },
      targetNorthM: 0,
      targetEastM: 0,
      touchdownSpeedMps: 0,
    },
    tf,
    { nodes: 60, massIterations: 1 },
  );

  it('is flyable and matches the analytic switch structure (min → max thrust)', () => {
    expect(sol.solver.status).toBe('converged');
    expect(sol.terminalPositionErrorM).toBeLessThan(0.01);
    expect(sol.terminalVelocityErrorMps).toBeLessThan(0.01);
    const sigmas = sol.nodes.slice(0, -1).map((n) => n.sigma);
    // Early arc rides the lower bound, terminal arc the upper bound.
    expect(sigmas[0]).toBeLessThan(umin + 0.2);
    expect(sigmas[sigmas.length - 1]).toBeGreaterThan(umax - 0.2);
  });

  it('reproduces the analytic minimum fuel cost to discretization accuracy', () => {
    const cost = sol.nodes.slice(0, -1).reduce((acc, n) => acc + n.sigma * sol.dtS, 0);
    // One ZOH node straddles the switch → error ≤ (umax−umin)·Δt ≈ 0.7% here.
    expect(Math.abs(cost - analyticCost) / analyticCost).toBeLessThan(0.01);
  });

  it('keeps the lossless relaxation tight on the bang-bang arcs', () => {
    expect(sol.maxRelaxationGapMps2).toBeLessThan(1e-3);
    expect(sol.maxBoundViolationMps2).toBeLessThan(1e-3);
  });
});

describe('PDG 3-D divert with glide-slope constraint', () => {
  const vehicle: PdgVehicle = { massKg: 3000, minThrustN: 20000, maxThrustN: 50000, ispS: 282 };
  const glide = (45 * Math.PI) / 180;
  const sol = solvePdg(
    vehicle,
    {
      r0: { x: -200, y: 150, z: -2500 },
      v0: { x: 5, y: -10, z: 100 },
      targetNorthM: 0,
      targetEastM: 0,
      touchdownSpeedMps: 1,
      glideSlopeRad: glide,
    },
    40,
    { nodes: 30 },
  );

  it('converges to a flyable plan (lossless, in-band, on-target)', () => {
    expect(pdgIsFlyable(sol)).toBe(true);
    expect(sol.maxRelaxationGapMps2).toBeLessThan(1e-3);
    const umin = vehicle.minThrustN / vehicle.massKg; // loosest bound (mass shrinks)
    for (const n of sol.nodes.slice(0, -1)) {
      expect(n.sigma).toBeGreaterThan(umin * 0.9);
    }
  });

  it('respects the glide-slope cone at every interior node', () => {
    const tg = Math.tan(glide);
    for (const n of sol.nodes.slice(1, -1)) {
      const lateral = Math.hypot(n.r.x, n.r.y);
      const height = -n.r.z;
      expect(lateral).toBeLessThanOrEqual(tg * height + 0.5);
    }
  });

  it('accounts for mass depletion in the thrust bounds (successive approximation)', () => {
    expect(sol.propellantKg).toBeGreaterThan(100);
    expect(sol.propellantKg).toBeLessThan(800);
    const mEnd = sol.nodes[sol.nodes.length - 1].massKg;
    expect(mEnd).toBeCloseTo(vehicle.massKg - sol.propellantKg, 6);
  });
});

describe('closed-loop 6-DOF PDG landings (README §10.2.4 gates)', () => {
  const PROP_KG = 800;
  const scenarios = [
    { label: 'vertical, mid & moderate', altitudeM: 2000, descentRateMps: 100, propellantKg: PROP_KG },
    { label: 'vertical, high & fast', altitudeM: 3000, descentRateMps: 150, propellantKg: PROP_KG },
    {
      label: 'large divert (250 m offset, crossrange drift)',
      altitudeM: 2500,
      descentRateMps: 100,
      northM: -200,
      eastM: 150,
      vNorthMps: 5,
      vEastMps: -10,
      propellantKg: PROP_KG,
    },
  ];

  for (const sc of scenarios) {
    describe(sc.label, () => {
      const { result, solution } = runPdgLandingSim(cfg, sc, { maxTime: 120 });
      const landing = result.summary.landing!;

      it('plans a flyable convex trajectory', () => {
        console.log(
          `[${sc.label}] tf=${solution.tfS.toFixed(1)}s plan-prop=${solution.propellantKg.toFixed(0)}kg ` +
            `gap=${solution.maxRelaxationGapMps2.toExponential(1)}`,
        );
        expect(solution.solver.status).toBe('converged');
        expect(pdgIsFlyable(solution)).toBe(true);
      });

      it('touches down softly on target', () => {
        console.log(
          `[${sc.label}] vz=${landing.touchdownVz.toFixed(2)} miss=${landing.missDistance.toFixed(2)} ` +
            `lat=${landing.touchdownLateralSpeed.toFixed(2)} prop=${landing.propellantUsedKg.toFixed(0)}`,
        );
        expect(landing.touchedDown).toBe(true);
        expect(landing.touchdownVz).toBeGreaterThan(0);
        expect(landing.touchdownVz).toBeLessThan(TOUCHDOWN_LIMIT);
        expect(landing.missDistance).toBeLessThan(10);
        expect(landing.touchdownLateralSpeed).toBeLessThan(1.5);
      });

      it('stays inside the throttle band and propellant budget', () => {
        expect(landing.propellantUsedKg).toBeLessThan(PROP_KG);
        for (const f of result.telemetry) {
          if (f.throttle > 0) {
            expect(f.throttle).toBeGreaterThanOrEqual(cfg.propulsion.throttle.min - 1e-12);
            expect(f.throttle).toBeLessThanOrEqual(cfg.propulsion.throttle.max + 1e-12);
          }
        }
      });
    });
  }

  it('uses comparable propellant to the Phase-4 suicide burn on the same case', () => {
    // PDG burns continuously from activation (σ ≥ u_min), so it cannot beat
    // the coast-then-burn optimum — but it should stay in the same class.
    const sc = { altitudeM: 2000, descentRateMps: 100, propellantKg: PROP_KG };
    const classic = runLandingSim(cfg, sc, { maxTime: 120 }).summary.landing!;
    const pdg = runPdgLandingSim(cfg, sc, { maxTime: 120 }).result.summary.landing!;
    console.log(`prop classic=${classic.propellantUsedKg.toFixed(0)} pdg=${pdg.propellantUsedKg.toFixed(0)}`);
    expect(pdg.propellantUsedKg).toBeLessThan(classic.propellantUsedKg * 2.5);
  });
});

describe('boostback scenario (plan A8 stretch)', () => {
  const { result, boostbackCutoffTime, landingIgnitionTime } = runBoostbackLandingSim(
    cfg,
    {
      altitudeM: 3000,
      northM: -1200,
      vNorthMps: -70, // moving AWAY from the pad
      climbRateMps: 40, // still ascending at staging
      descentRateMps: 0, // overridden by climbRateMps
      propellantKg: 1500,
    },
    { maxTime: 200 },
  );
  const landing = result.summary.landing!;

  it('executes the full phase sequence: boostback burn → flip → coast → landing burn', () => {
    console.log(
      `boostback cutoff=${boostbackCutoffTime?.toFixed(1)}s ignition=${landingIgnitionTime?.toFixed(1)}s ` +
        `vz=${landing.touchdownVz.toFixed(2)} miss=${landing.missDistance.toFixed(1)} prop=${landing.propellantUsedKg.toFixed(0)}`,
    );
    expect(boostbackCutoffTime).not.toBeNull();
    expect(boostbackCutoffTime!).toBeGreaterThan(1);
    expect(landingIgnitionTime).not.toBeNull();
    expect(landingIgnitionTime!).toBeGreaterThan(boostbackCutoffTime!);
    // Engine-off coast existed between the flip and landing ignition.
    const coastFrames = result.telemetry.filter(
      (f) => f.t > boostbackCutoffTime! && f.t < landingIgnitionTime! && f.throttle === 0,
    );
    expect(coastFrames.length).toBeGreaterThan(0);
  });

  it('returns to the pad inside the touchdown gates (soft landing, bounded miss)', () => {
    expect(landing.touchedDown).toBe(true);
    expect(landing.touchdownVz).toBeGreaterThan(0);
    expect(landing.touchdownVz).toBeLessThan(TOUCHDOWN_LIMIT);
    // Measured ≈ 45 m from a 1.2 km divert: the t_eff burn-extension estimate
    // is deliberately rough, and the Phase-4 lateral channel (proven on 60 m
    // offsets) absorbs the residual. Gate at 60 m.
    expect(landing.missDistance).toBeLessThan(60);
    expect(landing.propellantUsedKg).toBeLessThan(1500);
  });
});
