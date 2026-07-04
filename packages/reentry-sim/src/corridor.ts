/**
 * Entry-corridor boundary search (README §5.4; plan Phase 5, trap T3).
 *
 * Overshoot (skip-out) boundary: shallowest γ_entry that does NOT skip.
 * Undershoot (burn-up) boundary: steepest γ_entry whose peaks stay within the
 * §8.2 heat-flux/g-load limits. Both found by bisection over γ_entry at fixed
 * V_entry, to a γ tolerance of 1e-4 rad, with a bracket-validity precheck and
 * a max-iteration guard.
 *
 * Trap T3 (plan): the sim's RK45 tolerance must be pinned at least 10× tighter
 * than the γ bisection tolerance, or the boundary "converges" to integrator
 * noise. `runReentry` defaults to tol = 1e-8 ≪ GAMMA_TOL_RAD/10; the guard in
 * `bisectBoundary` enforces the ratio for caller-supplied options.
 */

import { runReentry, type ReentryRunOptions } from './sim.js';
import type { CorridorCurve, ReentryConfig, ReentryRun } from './types.js';

/** γ bisection convergence tolerance, rad (plan Phase 5). */
export const GAMMA_TOL_RAD = 1e-4;

/** Hard cap on bisection iterations (plan: max-iteration guard). */
const MAX_ITER = 80;

/**
 * Classify a completed run (README §5.4, plan A4): a post-perigee climb back
 * above the entry interface is a skip; otherwise exceeding a configured limit
 * anywhere along the trajectory marks the run 'limits-exceeded'; anything
 * else reached the ground inside the limits.
 */
export const classifyTrajectory = (
  run: ReentryRun,
): 'landed' | 'skipped' | 'limits-exceeded' => {
  if (run.peaks.terminationReason === 'skipped') return 'skipped';
  if (run.peaks.limitsExceeded) return 'limits-exceeded';
  return 'landed';
};

/** Entry bracket [shallow, steep] in rad; order-insensitive on input. */
export type GammaBracket = [number, number];

interface BoundaryProblem {
  /** Predicate that flips exactly once across the boundary. */
  predicate: (run: ReentryRun) => boolean;
  /** Expected predicate value at the shallow end of a valid bracket. */
  shallowValue: boolean;
  label: string;
}

const bisectBoundary = (
  cfg: ReentryConfig,
  vEntry: number,
  bracket: GammaBracket,
  problem: BoundaryProblem,
  opts: ReentryRunOptions,
  tolRad: number,
): number => {
  const simTol = opts.tol ?? 1e-8;
  if (simTol > tolRad / 10) {
    throw new Error(
      `corridor: integrator tol ${simTol} must be ≥10× tighter than the γ bisection tol ${tolRad} (trap T3)`,
    );
  }

  // Shallow = closer to level flight (larger, both typically negative).
  let shallow = Math.max(bracket[0], bracket[1]);
  let steep = Math.min(bracket[0], bracket[1]);

  const evaluate = (gamma: number): boolean =>
    problem.predicate(runReentry(cfg, gamma, vEntry, opts));

  // Bracket-validity precheck (plan): the endpoints must straddle the boundary.
  const atShallow = evaluate(shallow);
  const atSteep = evaluate(steep);
  if (atShallow !== problem.shallowValue || atSteep === problem.shallowValue) {
    throw new Error(
      `corridor: ${problem.label} bracket [${shallow}, ${steep}] rad does not straddle the boundary ` +
        `at V_entry = ${vEntry} m/s (shallow end ${atShallow}, steep end ${atSteep})`,
    );
  }

  let it = 0;
  while (shallow - steep > tolRad) {
    if (++it > MAX_ITER) {
      throw new Error(`corridor: ${problem.label} bisection exceeded ${MAX_ITER} iterations`);
    }
    const mid = 0.5 * (shallow + steep);
    if (evaluate(mid) === problem.shallowValue) shallow = mid;
    else steep = mid;
  }
  return 0.5 * (shallow + steep);
};

/**
 * Overshoot / skip-out boundary (README §5.4): the shallowest allowable
 * γ_entry. The shallow bracket end must skip out; the steep end must not.
 */
export const findOvershootBoundary = (
  cfg: ReentryConfig,
  vEntry: number,
  bracket: GammaBracket,
  opts: ReentryRunOptions = {},
  tolRad: number = GAMMA_TOL_RAD,
): number =>
  bisectBoundary(
    cfg,
    vEntry,
    bracket,
    {
      predicate: (run) => classifyTrajectory(run) === 'skipped',
      shallowValue: true,
      label: 'overshoot',
    },
    opts,
    tolRad,
  );

/**
 * Undershoot / burn-up boundary (README §5.4): the steepest allowable
 * γ_entry, set by whichever of peak q̇ₛ or peak n first exceeds its limit.
 * The steep bracket end must exceed a limit; the shallow end must not.
 */
export const findUndershootBoundary = (
  cfg: ReentryConfig,
  vEntry: number,
  bracket: GammaBracket,
  opts: ReentryRunOptions = {},
  tolRad: number = GAMMA_TOL_RAD,
): number =>
  bisectBoundary(
    cfg,
    vEntry,
    bracket,
    {
      predicate: (run) => run.peaks.limitsExceeded,
      shallowValue: false,
      label: 'undershoot',
    },
    opts,
    tolRad,
  );

/** Options for {@link findEntryCorridor}. */
export interface CorridorSweepOptions {
  /** Bracket for the overshoot search at every velocity, rad. */
  overshootBracket?: GammaBracket;
  /** Bracket for the undershoot search at every velocity, rad. */
  undershootBracket?: GammaBracket;
  /** Per-run sim options (integrator tolerance, bank profile, ...). */
  sim?: ReentryRunOptions;
  /** γ bisection tolerance, rad. */
  tolRad?: number;
}

/**
 * Sweep entry velocity and find both corridor boundaries at each point —
 * the data behind the signature corridor chart (README §5.4).
 */
export const findEntryCorridor = (
  cfg: ReentryConfig,
  vEntryRange: [number, number],
  nPoints: number,
  opts: CorridorSweepOptions = {},
): CorridorCurve => {
  if (nPoints < 2) throw new Error('corridor: nPoints must be ≥ 2');
  const overshootBracket = opts.overshootBracket ?? [-0.002, -0.15];
  const undershootBracket = opts.undershootBracket ?? [-0.01, -0.35];
  const sim = opts.sim ?? {};
  const tolRad = opts.tolRad ?? GAMMA_TOL_RAD;

  const vEntry: number[] = [];
  const gammaOvershoot: number[] = [];
  const gammaUndershoot: number[] = [];
  const [vLo, vHi] = vEntryRange;
  for (let i = 0; i < nPoints; i++) {
    const v = vLo + ((vHi - vLo) * i) / (nPoints - 1);
    vEntry.push(v);
    gammaOvershoot.push(findOvershootBoundary(cfg, v, overshootBracket, sim, tolRad));
    gammaUndershoot.push(findUndershootBoundary(cfg, v, undershootBracket, sim, tolRad));
  }
  return { vEntry, gammaOvershoot, gammaUndershoot };
};
