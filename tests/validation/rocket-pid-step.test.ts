/**
 * README §10.2.3 — PID gimbal control: a step attitude-error must produce a
 * damped second-order closed-loop response consistent with the configured
 * gains, compared against the linearized closed-loop prediction
 *
 *   θ̈ = (T·l_arm / Iyy)·δp,   δp = Kp·θ_err + Ki·∫θ_err dt + Kd·(−q)
 *
 * with the INSTANTANEOUS Iyy and moment arm l_arm (from `massProps` at the
 * telemetry's mass each step). Run at BOTH full and near-empty propellant
 * loads (plan trap T2): a sim that caches the moment arm or inertia at the
 * full-load config values produces a plant gain wrong by ~2.5× at the
 * near-empty load and fails the trajectory comparison outright.
 *
 * The test vehicle isolates the control loop: zero-coefficient aero table
 * (no aero forces/moments), constant-thrust curve, launched airborne and
 * horizontal (θ0 = 0, away from the Euler singularity), gimbal limits set
 * wide so the loop stays in its linear range. The prediction hand-rolls the
 * §4.6 control law + actuator (independent of the shipped `Pid` class) and
 * integrates the linear plant with the same RK4 step and zero-order hold, so
 * the only thing that differs is the plant: full 6-DOF vs θ̈ = K(t)·δp.
 */
import { describe, it, expect } from 'vitest';
import {
  attitudeHold,
  loadAeroTable,
  loadThrustCurve,
  massProps,
  runRocketSim,
} from '@fds/rocket-sim';
import type { RocketConfig, RocketState, TelemetryFrame } from '@fds/rocket-sim';
import { qidentity, rk4Step } from '@fds/physics-core';

const zeroAero = loadAeroTable(
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0',
);

const THRUST_N = 210000;
const GAINS = { kp: 2.0, ki: 0.05, kd: 0.313 }; // ζ ≈ 0.5 at full load
const DT = 0.01;
const RUN_S = 4; // < time-to-burnout at the near-empty load (~7 s)
const THETA_CMD = 0.0349; // 2° step

// Reference-booster mass/geometry (§8.1); wide gimbal limits keep the loop
// linear so the 2nd-order comparison is clean (slew limiting has its own
// unit test).
const cfg: RocketConfig = {
  name: 'pid-step-test',
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
    thrustCurve: loadThrustCurve(`0,${THRUST_N}\n1000,${THRUST_N}`),
    ispSeaLevelS: 282,
    ispVacuumS: 311,
    gimbal: {
      maxDeflectionRad: 0.35, // 20°
      maxSlewRateRps: 8.7, // 500°/s
      positionFromNoseM: 11.8,
    },
    throttle: { min: 0.4, max: 1.0 },
  },
  aero: { table: zeroAero, cpFromNoseM: 5.4 },
  guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
  control: {
    pidPitch: GAINS,
    pidYaw: GAINS,
    rollControlEnabled: false,
  },
};

/** Plant gain K = T·l_arm/Iyy at a given propellant load (instantaneous). */
const plantGain = (mProp: number): number => {
  const mp = massProps(cfg.mass, mProp);
  const lArm = cfg.propulsion.gimbal.positionFromNoseM - mp.cgFromNose;
  return (THRUST_N * lArm) / mp.I[4]; // I[4] = Iyy (row-major diagonal)
};

/** Run the 6-DOF sim: at-rest, horizontal, airborne, step command θ_cmd. */
const runCase = (mProp: number): TelemetryFrame[] => {
  const initialState: RocketState = {
    r: { x: 0, y: 0, z: -1000 },
    v: { x: 0, y: 0, z: 0 },
    q: qidentity(), // θ0 = 0 (nose North, horizontal)
    omega: { x: 0, y: 0, z: 0 },
    mass: cfg.mass.dryKg + mProp,
  };
  const guidance = attitudeHold(cfg, () => ({ theta: THETA_CMD, psi: 0 }));
  const { telemetry } = runRocketSim(cfg, guidance, {
    initialState,
    dt: DT,
    maxTime: RUN_S,
    groundConstraint: false,
  });
  return telemetry;
};

/**
 * Linearized closed-loop prediction: hand-rolled §4.6 PID + actuator (mirrors
 * the shipped implementations' step order: dt = 0 on the first guidance call,
 * integral advanced before the output, actuator clamp + slew) driving the
 * linear plant θ̈ = K(t)·δp, with K(t) from `massProps` at the SIM's own mass
 * history — the instantaneous Iyy and l_arm of the plan's linearized model.
 */
const predict = (telemetry: TelemetryFrame[]): number[] => {
  const { kp, ki, kd } = GAINS;
  const { maxDeflectionRad, maxSlewRateRps } = cfg.propulsion.gimbal;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

  let x: Float64Array = new Float64Array([0, 0]); // [θ, q]
  let integral = 0;
  let delta = 0; // actuator state
  const theta: number[] = [x[0]];

  for (let i = 0; i < telemetry.length - 1; i++) {
    const dtCtl = i === 0 ? 0 : DT; // attitudeHold sees dt = 0 on its first call
    const err = THETA_CMD - x[0];
    integral += err * dtCtl;
    const cap = ki > 0 ? maxDeflectionRad / ki : Infinity;
    integral = clamp(integral, -cap, cap);
    const cmd = kp * err + ki * integral + kd * -x[1];
    const tgt = clamp(cmd, -maxDeflectionRad, maxDeflectionRad);
    delta += clamp(tgt - delta, -maxSlewRateRps * dtCtl, maxSlewRateRps * dtCtl);

    const K = plantGain(telemetry[i].mass - cfg.mass.dryKg);
    const deriv = (_t: number, s: Float64Array): Float64Array =>
      new Float64Array([s[1], K * delta]);
    x = rk4Step(deriv, i * DT, x, undefined, DT);
    theta.push(x[0]);
  }
  return theta;
};

interface StepMetrics {
  overshoot: number; // (θ_max − θ_cmd)/θ_cmd
  peakTime: number;
  riseTime: number; // first crossing of 90% θ_cmd
  settled: boolean; // |θ − θ_cmd| < 5% of the step for the final second
}

const stepMetrics = (telemetry: TelemetryFrame[]): StepMetrics => {
  let thetaMax = -Infinity;
  let peakTime = 0;
  let riseTime = Infinity;
  let settled = true;
  for (const f of telemetry) {
    if (f.euler.theta > thetaMax) {
      thetaMax = f.euler.theta;
      peakTime = f.t;
    }
    if (riseTime === Infinity && f.euler.theta >= 0.9 * THETA_CMD) riseTime = f.t;
    if (f.t > RUN_S - 1 && Math.abs(f.euler.theta - THETA_CMD) > 0.05 * THETA_CMD) {
      settled = false;
    }
  }
  return { overshoot: (thetaMax - THETA_CMD) / THETA_CMD, peakTime, riseTime, settled };
};

describe('PID step response vs linearized closed-loop prediction (README §10.2.3)', () => {
  const cases = [
    { label: 'full propellant', mProp: 8800 },
    { label: 'near-empty propellant (~5.7%)', mProp: 500 },
  ];

  for (const { label, mProp } of cases) {
    describe(label, () => {
      const telemetry = runCase(mProp);
      const predicted = predict(telemetry);

      it('6-DOF pitch response tracks the linearized prediction', () => {
        let maxErr = 0;
        for (let i = 0; i < telemetry.length; i++) {
          maxErr = Math.max(maxErr, Math.abs(telemetry[i].euler.theta - predicted[i]));
        }
        // Measured margin: ~3.6e-6 rad full / ~2.1e-6 rad near-empty (0.01% of
        // the step) — the gate below leaves ~300× headroom yet still fails hard
        // on a stale-arm/inertia bug (which shifts K by ~2.5× → tens of mrad).
        expect(maxErr).toBeLessThan(1e-3);
      });

      it('settles on the commanded attitude with the gimbal inside its limits', () => {
        const m = stepMetrics(telemetry);
        expect(m.settled).toBe(true);
        for (const f of telemetry) {
          expect(Math.abs(f.deltaP)).toBeLessThanOrEqual(cfg.propulsion.gimbal.maxDeflectionRad);
        }
      });
    });
  }

  it('full load shows the analytic damped 2nd-order character (ωn, ζ from instantaneous Iyy, l_arm)', () => {
    const telemetry = runCase(8800);
    const K = plantGain(8800);
    const wn = Math.sqrt(K * GAINS.kp);
    const zeta = (K * GAINS.kd) / (2 * wn);
    expect(zeta).toBeGreaterThan(0.3); // sanity: underdamped but well-damped
    expect(zeta).toBeLessThan(0.8);

    const m = stepMetrics(telemetry);
    const predictedOvershoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
    const predictedPeakTime = Math.PI / (wn * Math.sqrt(1 - zeta * zeta));
    // Modest tolerances: the small Ki term and the in-burn mass drift perturb
    // the pure 2nd-order closed form slightly.
    expect(m.overshoot).toBeGreaterThan(0.75 * predictedOvershoot);
    expect(m.overshoot).toBeLessThan(1.25 * predictedOvershoot);
    expect(m.peakTime).toBeGreaterThan(0.8 * predictedPeakTime);
    expect(m.peakTime).toBeLessThan(1.2 * predictedPeakTime);
  });

  it('near-empty load responds faster than full load (lighter vehicle, higher T·l/Iyy)', () => {
    const full = stepMetrics(runCase(8800));
    const empty = stepMetrics(runCase(500));
    expect(empty.riseTime).toBeLessThan(full.riseTime);
  });
});
