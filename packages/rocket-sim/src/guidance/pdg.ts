/**
 * Convex-optimization powered-descent guidance (Phase 7; README §11 "convex-
 * optimization powered-descent guidance", plan `rocket-sim/guidance/pdg.ts`).
 *
 * Formulation — the classic LOSSLESS-CONVEXIFICATION minimum-fuel PDG
 * (Açıkmeşe & Ploen, "Convex Programming Approach to Powered Descent Guidance
 * for Mars Landing", JGCD 30(5), 2007), in 3-DOF point-mass form over the
 * flat-Earth NED frame the rocket module already uses (plan A14):
 *
 *   minimize    Σ σ_k·Δt                      (∝ propellant, since ṁ = m·σ/(g0·Isp))
 *   subject to  r_{k+1} = r_k + Δt·v_k + Δt²/2·(g + u_k)
 *               v_{k+1} = v_k + Δt·(g + u_k)          (ZOH double integrator)
 *               ‖u_k‖ ≤ σ_k                            (SOC — the relaxation)
 *               u_min,k ≤ σ_k ≤ u_max,k                (throttle band, A7)
 *               ‖(r_N,k, r_E,k) − target‖ ≤ tan(γ_gs)·h_k    (optional glide slope)
 *               r_0, v_0 fixed;  r_N = target, v_N = (0, 0, v_td)
 *
 * u is the thrust SPECIFIC force (m/s²); the nonconvex annulus u_min ≤ ‖u‖ ≤
 * u_max becomes convex through the slack σ, and the relaxation is lossless:
 * at the optimum σ = ‖u‖ (checked and reported as `maxRelaxationGapMps2`).
 *
 * Simplifications, documented in docs/equations.md Phase 7:
 *  - Thrust bounds are divided by a per-node MASS ESTIMATE instead of the
 *    z = ln m change of variables of the full GFOLD problem; the estimate is
 *    refined by successive approximation (solve → integrate ṁ = m·σ/(g0·Isp)
 *    → re-solve), which converges in 2 iterations for ≤20% mass depletion.
 *  - Gravity is the constant g0 (over a ≤3 km descent g varies < 0.1%; the
 *    tracking loop absorbs it, like every other unmodeled effect).
 *  - Aerodynamic drag is not modeled (Phase-4 precedent: the shipped aero
 *    table has no tail-first validity; §10.2.4-class tests use a zero table).
 *  - Isp is the sea-level value (conservative for the mass estimate).
 *  - The engine burns CONTINUOUSLY from activation (σ ≥ u_min > 0): PDG plans
 *    a burn, not a coast — activate it where you would light the engine.
 *
 * The solve is nondimensionalized (time by tf, acceleration by g0, length by
 * g0·tf²) so the ADMM solver in `socp.ts` sees O(1) data.
 *
 * `poweredDescentPdgGuidance` then flies the reference with the feedforward
 * acceleration plus a PD position/velocity correction, closed through the
 * same direction-vector attitude controller + gimbal actuator as Phase 4:
 *
 *   f_des = u_ref + kp·(r_ref − r) + kd·(v_ref − v)     (specific force, NED)
 *   throttle = clamp(m·‖f_des‖/T_rated, throttle band)
 *   nose direction d̂ = f_des/‖f_des‖ → AttitudeController.updateDirection
 */

import { G0, rotateBodyToNED, vnorm, type Vec3 } from '@fds/physics-core';
import { AttitudeController } from '../control/attitudeControl.js';
import type { GimbalCommand, RocketConfig, RocketState } from '../types.js';
import type { DescentGuidance } from './landing.js';
import {
  attachLandingMetrics,
  initialDescentState,
  runRocketSim,
  type LandingRunOptions,
  type LandingScenario,
  type RunResult,
} from '../sim.js';
import { solveSocp, type SocpProblem, type SocpSolution } from './socp.js';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Vehicle quantities the PDG problem needs (SI). */
export interface PdgVehicle {
  /** Wet mass at PDG activation, kg. */
  massKg: number;
  /** Minimum sustainable thrust (rated × min throttle), N. */
  minThrustN: number;
  /** Maximum thrust (rated × max throttle), N. */
  maxThrustN: number;
  /** Effective specific impulse for the mass estimate, s. */
  ispS: number;
}

/** Boundary conditions in NED (target on the ground plane z = 0). */
export interface PdgScenario {
  /** Initial position, m (z = −altitude). */
  r0: Vec3;
  /** Initial velocity, m/s (NED; +z = descending). */
  v0: Vec3;
  /** Landing-target north/east coordinates, m. */
  targetNorthM: number;
  targetEastM: number;
  /** Final descent rate at touchdown, m/s (≥ 0). */
  touchdownSpeedMps: number;
  /** Optional glide-slope half-angle from vertical, rad (README §4.6-adjacent). */
  glideSlopeRad?: number;
}

/** One discretization node of the solved trajectory. */
export interface PdgNode {
  t: number;
  r: Vec3;
  v: Vec3;
  /** Thrust specific force, m/s² (piecewise-constant over [t, t+Δt)). */
  u: Vec3;
  /** Relaxation slack σ ≥ ‖u‖, m/s². */
  sigma: number;
  /** Mass estimate, kg. */
  massKg: number;
  /** Predicted throttle m·σ/T_rated·(max throttle) normalization left to caller. */
  thrustN: number;
}

export interface PdgSolution {
  /** N+1 nodes (u/σ on the first N; the last carries the terminal state). */
  nodes: PdgNode[];
  tfS: number;
  dtS: number;
  /** Predicted propellant use, kg. */
  propellantKg: number;
  /** max_k (σ_k − ‖u_k‖): ≈ 0 when the convex relaxation is lossless. */
  maxRelaxationGapMps2: number;
  /** Terminal boundary-condition residuals of the discrete solution. */
  terminalPositionErrorM: number;
  terminalVelocityErrorMps: number;
  /** Worst σ excursion outside [u_min, u_max], m/s². */
  maxBoundViolationMps2: number;
  solver: Pick<SocpSolution, 'status' | 'iterations' | 'primalResidual' | 'dualResidual'>;
}

export interface PdgOptions {
  /** Discretization nodes (default 30). */
  nodes?: number;
  /** Mass-estimate refinement passes (default 2). */
  massIterations?: number;
  /** Solver iteration cap per solve. */
  maxSolverIterations?: number;
}

/**
 * Solve the fixed-final-time minimum-fuel PDG problem. Returns the discrete
 * optimal trajectory with feasibility diagnostics — callers (and tests)
 * should check `solver.status`, the terminal residuals, and the relaxation
 * gap before flying it.
 */
export const solvePdg = (
  vehicle: PdgVehicle,
  scenario: PdgScenario,
  tfS: number,
  opts: PdgOptions = {},
): PdgSolution => {
  const N = opts.nodes ?? 30;
  const massIters = opts.massIterations ?? 2;
  const dt = tfS / N;

  // Nondimensional units: time/tf, acceleration/g0, length/(g0·tf²).
  const L = G0 * tfS * tfS;
  const VS = G0 * tfS;
  const h = 1 / N;

  const r0 = { x: scenario.r0.x / L, y: scenario.r0.y / L, z: scenario.r0.z / L };
  const v0 = { x: scenario.v0.x / VS, y: scenario.v0.y / VS, z: scenario.v0.z / VS };
  const target = { x: scenario.targetNorthM / L, y: scenario.targetEastM / L, z: 0 };
  const vT = { x: 0, y: 0, z: scenario.touchdownSpeedMps / VS };
  const gz = 1; // g in nd units, +Down

  // Propagation coefficients (per axis): r_k, v_k as affine functions of u.
  // cv[k][j] = ∂v_k/∂u_j (scalar, same axis), cr[k][j] = ∂r_k/∂u_j.
  const cv: number[][] = [];
  const cr: number[][] = [];
  for (let k = 0; k <= N; k++) {
    cv.push(new Array<number>(N).fill(0));
    cr.push(new Array<number>(N).fill(0));
  }
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      cv[k + 1][j] = cv[k][j] + (j === k ? h : 0);
      cr[k + 1][j] = cr[k][j] + h * cv[k][j] + (j === k ? (h * h) / 2 : 0);
    }
  }
  // Constant (u-free) parts, z axis carries gravity.
  const vConst = (axis: 'x' | 'y' | 'z', k: number): number =>
    (axis === 'x' ? v0.x : axis === 'y' ? v0.y : v0.z) + (axis === 'z' ? k * h * gz : 0);
  const rConstArr: Record<'x' | 'y' | 'z', number[]> = { x: [r0.x], y: [r0.y], z: [r0.z] };
  for (let k = 0; k < N; k++) {
    for (const axis of ['x', 'y', 'z'] as const) {
      rConstArr[axis].push(
        rConstArr[axis][k] + h * vConst(axis, k) + ((h * h) / 2) * (axis === 'z' ? gz : 0),
      );
    }
  }

  // Variable layout: node k block at 4k = [ux, uy, uz, σ]; n = 4N.
  const n = 4 * N;
  const iu = (k: number, axis: 0 | 1 | 2): number => 4 * k + axis;
  const isig = (k: number): number => 4 * k + 3;

  const glide = scenario.glideSlopeRad;
  const glideRows = glide !== undefined ? N - 1 : 0;

  // Mass-estimate loop (bounds only touch b, but rebuilding A is cheap).
  let mass = new Array<number>(N + 1).fill(vehicle.massKg);
  // Initial guess: hover-ish burn σ ≈ g0.
  for (let k = 0; k < N; k++) mass[k + 1] = mass[k] * Math.exp(-dt / vehicle.ispS);

  let sol: SocpSolution | null = null;
  let uminArr = new Array<number>(N).fill(0);
  let umaxArr = new Array<number>(N).fill(0);

  for (let pass = 0; pass < massIters; pass++) {
    uminArr = mass.slice(0, N).map((mk) => vehicle.minThrustN / (mk * G0));
    umaxArr = mass.slice(0, N).map((mk) => vehicle.maxThrustN / (mk * G0));

    const A: Float64Array[] = [];
    const b: number[] = [];

    // --- Equalities (6): terminal position and velocity. ---
    for (const [axis, ai] of [['x', 0], ['y', 1], ['z', 2]] as const) {
      const row = new Float64Array(n);
      for (let j = 0; j < N; j++) row[iu(j, ai)] = cr[N][j];
      A.push(row);
      b.push((axis === 'x' ? target.x : axis === 'y' ? target.y : target.z) - rConstArr[axis][N]);
    }
    for (const [axis, ai] of [['x', 0], ['y', 1], ['z', 2]] as const) {
      const row = new Float64Array(n);
      for (let j = 0; j < N; j++) row[iu(j, ai)] = cv[N][j];
      A.push(row);
      b.push((axis === 'x' ? vT.x : axis === 'y' ? vT.y : vT.z) - vConst(axis, N));
    }

    // --- Nonnegative rows (2N): σ within the throttle band. ---
    for (let k = 0; k < N; k++) {
      const hi = new Float64Array(n);
      hi[isig(k)] = 1; // s = umax − σ ≥ 0
      A.push(hi);
      b.push(umaxArr[k]);
    }
    for (let k = 0; k < N; k++) {
      const lo = new Float64Array(n);
      lo[isig(k)] = -1; // s = σ − umin ≥ 0
      A.push(lo);
      b.push(-uminArr[k]);
    }

    const socDims: number[] = [];

    // --- Glide-slope SOCs (3 rows each, nodes 1..N−1). ---
    if (glide !== undefined) {
      const tg = Math.tan(glide);
      for (let k = 1; k < N; k++) {
        const r0w = new Float64Array(n);
        for (let j = 0; j < N; j++) r0w[iu(j, 2)] = tg * cr[k][j]; // s0 = tg·(−r_z,k)
        A.push(r0w);
        b.push(-tg * rConstArr.z[k]);
        const r1w = new Float64Array(n);
        for (let j = 0; j < N; j++) r1w[iu(j, 0)] = -cr[k][j]; // s1 = r_x,k − target_x
        A.push(r1w);
        b.push(rConstArr.x[k] - target.x);
        const r2w = new Float64Array(n);
        for (let j = 0; j < N; j++) r2w[iu(j, 1)] = -cr[k][j];
        A.push(r2w);
        b.push(rConstArr.y[k] - target.y);
        socDims.push(3);
      }
    }

    // --- Thrust SOCs ‖u_k‖ ≤ σ_k (4 rows each). ---
    for (let k = 0; k < N; k++) {
      const s0 = new Float64Array(n);
      s0[isig(k)] = -1;
      A.push(s0);
      b.push(0);
      for (let ai = 0 as 0 | 1 | 2; ai < 3; ai++) {
        const si = new Float64Array(n);
        si[iu(k, ai as 0 | 1 | 2)] = -1;
        A.push(si);
        b.push(0);
      }
      socDims.push(4);
    }

    const c = new Float64Array(n);
    for (let k = 0; k < N; k++) c[isig(k)] = h;

    const problem: SocpProblem = {
      c,
      A,
      b: Float64Array.from(b),
      cones: { eq: 6, nonneg: 2 * N, soc: socDims },
    };
    sol = solveSocp(problem, {
      maxIterations: opts.maxSolverIterations ?? 20000,
    });

    // Refresh the mass profile from the solved burn: ṁ = m·σ/(g0·Isp).
    const next = [vehicle.massKg];
    for (let k = 0; k < N; k++) {
      const sigmaDim = sol.x[isig(k)] * G0;
      next.push(next[k] * Math.exp((-sigmaDim * dt) / (G0 * vehicle.ispS)));
    }
    mass = next;
  }

  if (!sol) throw new Error('solvePdg: no solve performed (massIterations < 1?)');

  // Reconstruct the dimensional trajectory from the optimal u by the same
  // recursion the constraints encode (so the diagnostics measure the discrete
  // problem, not a re-derivation).
  const nodes: PdgNode[] = [];
  let r = { ...scenario.r0 };
  let v = { ...scenario.v0 };
  let gap = 0;
  let boundViol = 0;
  for (let k = 0; k <= N; k++) {
    const last = k === N;
    const u: Vec3 = last
      ? { x: 0, y: 0, z: 0 }
      : {
          x: sol.x[iu(k, 0)] * G0,
          y: sol.x[iu(k, 1)] * G0,
          z: sol.x[iu(k, 2)] * G0,
        };
    const sigma = last ? 0 : sol.x[isig(k)] * G0;
    if (!last) {
      gap = Math.max(gap, sigma - vnorm(u));
      boundViol = Math.max(
        boundViol,
        Math.max(0, sigma - umaxArr[k] * G0),
        Math.max(0, uminArr[k] * G0 - sigma),
      );
    }
    nodes.push({
      t: k * dt,
      r: { ...r },
      v: { ...v },
      u,
      sigma,
      massKg: mass[k],
      thrustN: mass[k] * sigma,
    });
    if (!last) {
      const az = G0 + u.z; // gravity +Down
      r = {
        x: r.x + dt * v.x + ((dt * dt) / 2) * u.x,
        y: r.y + dt * v.y + ((dt * dt) / 2) * u.y,
        z: r.z + dt * v.z + ((dt * dt) / 2) * az,
      };
      v = { x: v.x + dt * u.x, y: v.y + dt * u.y, z: v.z + dt * az };
    }
  }

  const terminal = nodes[N];
  const posErr = Math.hypot(
    terminal.r.x - scenario.targetNorthM,
    terminal.r.y - scenario.targetEastM,
    terminal.r.z - 0,
  );
  const velErr = Math.hypot(
    terminal.v.x,
    terminal.v.y,
    terminal.v.z - scenario.touchdownSpeedMps,
  );

  return {
    nodes,
    tfS,
    dtS: dt,
    propellantKg: vehicle.massKg - mass[N],
    maxRelaxationGapMps2: gap,
    terminalPositionErrorM: posErr,
    terminalVelocityErrorMps: velErr,
    maxBoundViolationMps2: boundViol,
    solver: {
      status: sol.status,
      iterations: sol.iterations,
      primalResidual: sol.primalResidual,
      dualResidual: sol.dualResidual,
    },
  };
};

/** Practical feasibility gate used by the tf sweep (and handy in tests). */
export const pdgIsFlyable = (sol: PdgSolution): boolean =>
  sol.solver.status === 'converged' &&
  sol.terminalPositionErrorM < 1.0 &&
  sol.terminalVelocityErrorMps < 0.1 &&
  sol.maxBoundViolationMps2 < 0.05 &&
  sol.maxRelaxationGapMps2 < 0.05;

/**
 * Sweep the final time over a heuristic grid and return the min-fuel flyable
 * solution (fixed-tf solves; the free-tf optimum lies between grid points,
 * which is fine for guidance).
 */
export const solvePdgAuto = (
  vehicle: PdgVehicle,
  scenario: PdgScenario,
  opts: PdgOptions & { tfGridS?: number[] } = {},
): PdgSolution => {
  let grid = opts.tfGridS;
  if (!grid) {
    const aUp = vehicle.maxThrustN / vehicle.massKg - G0;
    if (aUp <= 0.2) {
      throw new Error('solvePdgAuto: thrust-to-weight too low to plan a landing');
    }
    const h0 = Math.max(1, -scenario.r0.z);
    const tBase = vnorm(scenario.v0) / aUp + Math.sqrt((2 * h0) / aUp);
    grid = [0.8, 1.0, 1.3, 1.7].map((f) => f * tBase);
  }
  let best: PdgSolution | null = null;
  let bestAny: PdgSolution | null = null;
  for (const tf of grid) {
    const sol = solvePdg(vehicle, scenario, tf, opts);
    if (!bestAny || sol.terminalPositionErrorM < bestAny.terminalPositionErrorM) bestAny = sol;
    if (pdgIsFlyable(sol) && (!best || sol.propellantKg < best.propellantKg)) best = sol;
  }
  if (best) return best;
  // Nothing flyable: return the least-infeasible solve so the caller can see
  // the diagnostics instead of a bare throw.
  if (!bestAny) throw new Error('solvePdgAuto: empty tf grid');
  return bestAny;
};

/** Tracking gains for {@link poweredDescentPdgGuidance}. */
export interface PdgTrackingGains {
  /** Position-error gain, 1/s² (default 0.08). */
  kp?: number;
  /** Velocity-error gain, 1/s (default 0.6). */
  kd?: number;
}

/**
 * Fly a PDG reference trajectory (README §4.6 cascade, Phase-4 machinery):
 * feedforward u_ref + PD correction → thrust direction + throttle. The
 * engine burns from t = 0 (see module header); `ignitionTime` is 0.
 */
export const poweredDescentPdgGuidance = (
  cfg: RocketConfig,
  sol: PdgSolution,
  gains: PdgTrackingGains = {},
): DescentGuidance => {
  const control = cfg.control;
  const descent = control?.descent;
  if (!control || !descent) {
    throw new Error('poweredDescentPdgGuidance: config has no "control.descent" section');
  }
  const kp = gains.kp ?? 0.08;
  const kd = gains.kd ?? 0.6;
  const { min: thrMin, max: thrMax } = cfg.propulsion.throttle;
  const attitude = new AttitudeController(control, cfg.propulsion.gimbal);
  const N = sol.nodes.length - 1;

  let lastT: number | null = null;

  const terminalNode = sol.nodes[N];

  const reference = (t: number): { r: Vec3; v: Vec3; u: Vec3 } => {
    if (t >= sol.tfS) {
      // Past the planned final time: the last burn node's max-thrust
      // feedforward must NOT persist (thrust-to-weight > 1 would make the
      // vehicle hover above the pad). Hold a hover-descent reference at the
      // target instead: u = −g cancels gravity, the PD terms steer onto the
      // touchdown descent rate.
      return {
        r: terminalNode.r,
        v: terminalNode.v,
        u: { x: 0, y: 0, z: -G0 },
      };
    }
    const kf = clamp(t / sol.dtS, 0, N - 1e-9);
    const k = Math.floor(kf);
    const frac = kf - k;
    const a = sol.nodes[k];
    const bNode = sol.nodes[k + 1];
    const lerp = (p: Vec3, q: Vec3): Vec3 => ({
      x: p.x + (q.x - p.x) * frac,
      y: p.y + (q.y - p.y) * frac,
      z: p.z + (q.z - p.z) * frac,
    });
    return { r: lerp(a.r, bNode.r), v: lerp(a.v, bNode.v), u: a.u };
  };

  return {
    get ignitionTime(): number | null {
      return 0;
    },

    command(t: number, s: RocketState): GimbalCommand {
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;

      const ref = reference(t);
      const vNED = rotateBodyToNED(s.q, s.v);
      const f: Vec3 = {
        x: ref.u.x + kp * (ref.r.x - s.r.x) + kd * (ref.v.x - vNED.x),
        y: ref.u.y + kp * (ref.r.y - s.r.y) + kd * (ref.v.y - vNED.y),
        z: ref.u.z + kp * (ref.r.z - s.r.z) + kd * (ref.v.z - vNED.z),
      };
      const fMag = vnorm(f);
      // Degenerate demand (upside-down or vanishing): hold nose-up, min burn.
      const dir: Vec3 = fMag > 1e-6 && f.z < 0 ? f : { x: 0, y: 0, z: -1 };
      const throttle = clamp((s.mass * fMag) / descent.ratedThrustN, thrMin, thrMax);
      const act = attitude.updateDirection(dir, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle };
    },
  };
};

/** Result bundle of {@link runPdgLandingSim}: the 6-DOF run + the plan flown. */
export interface PdgRunResult {
  result: RunResult;
  solution: PdgSolution;
}

/**
 * PDG counterpart of `runLandingSim` (Phase 7): plan a convex min-fuel
 * trajectory from the scenario state, then fly it closed-loop in the full
 * 6-DOF sim with the constant-rating landing engine (plan A7). The burn is
 * continuous from scenario start (see module header).
 */
export const runPdgLandingSim = (
  cfg: RocketConfig,
  scenario: LandingScenario,
  opts: LandingRunOptions & { pdg?: PdgOptions & { tfGridS?: number[] }; gains?: PdgTrackingGains } = {},
): PdgRunResult => {
  const descent = cfg.control?.descent;
  if (!descent) {
    throw new Error('runPdgLandingSim: config has no "control.descent" section (README §8.1)');
  }
  const maxTime = opts.maxTime ?? 300;
  const landingCfg: RocketConfig = {
    ...cfg,
    propulsion: {
      ...cfg.propulsion,
      thrustCurve: {
        time: [0, maxTime + 1],
        thrust: [descent.ratedThrustN, descent.ratedThrustN],
      },
    },
  };

  const target = cfg.control?.landingTarget ?? { northM: 0, eastM: 0, touchdownVzMaxMps: 2.0 };
  const initialState = initialDescentState(cfg, scenario);
  const solution = solvePdgAuto(
    {
      massKg: initialState.mass,
      minThrustN: descent.ratedThrustN * cfg.propulsion.throttle.min,
      maxThrustN: descent.ratedThrustN * cfg.propulsion.throttle.max,
      ispS: cfg.propulsion.ispSeaLevelS,
    },
    {
      r0: { x: scenario.northM ?? 0, y: scenario.eastM ?? 0, z: -scenario.altitudeM },
      v0: { x: scenario.vNorthMps ?? 0, y: scenario.vEastMps ?? 0, z: scenario.descentRateMps },
      targetNorthM: target.northM,
      targetEastM: target.eastM,
      touchdownSpeedMps: descent.touchdownSpeedMps,
    },
    opts.pdg,
  );

  const guidance = poweredDescentPdgGuidance(landingCfg, solution, opts.gains);
  const result = runRocketSim(landingCfg, guidance, {
    ...opts,
    maxTime,
    initialState,
    groundConstraint: true,
  });
  attachLandingMetrics(result, cfg, initialState.mass, guidance.ignitionTime);
  return { result, solution };
};
