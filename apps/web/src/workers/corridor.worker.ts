/**
 * Module B batch-run worker (plan Phase 6): single reentry trajectories and
 * the corridor sweep. Corridor points stream back one at a time — each point
 * costs two bisections (~20 adaptive RK45 runs), so the chart shades in live
 * rather than blocking until the whole sweep lands.
 */

import {
  classifyTrajectory,
  findOvershootBoundary,
  findUndershootBoundary,
  runReentry,
  type GammaBracket,
} from '@fds/reentry-sim';
import { degToRad } from '@fds/physics-core';
import { genericCapsule } from '../lib/data';
import type { ReentryRequest, ReentryResponse } from '../lib/simWorker';

const post = (msg: ReentryResponse): void => (self as unknown as Worker).postMessage(msg);

/**
 * Search brackets known to straddle both boundaries for the generic capsule
 * over the UI's sweep range (probed in tests/validation/corridor-bisection).
 */
const OVERSHOOT_BRACKET: GammaBracket = [degToRad(-0.5), degToRad(-3.5)];
const UNDERSHOOT_BRACKET: GammaBracket = [degToRad(-3.0), degToRad(-6.0)];
/** Peaks-only runs during bisection: keep the recorded history sparse. */
const SWEEP_SIM = { sampleEvery: 500 };

self.onmessage = (ev: MessageEvent<ReentryRequest>): void => {
  const req = ev.data;
  try {
    const capsule = genericCapsule();
    if (req.kind === 'run') {
      const run = runReentry(capsule, req.gammaRad, req.vEntryMps, {
        sampleEvery: req.sampleEvery,
      });
      post({
        kind: 'run-result',
        history: run.history,
        peaks: run.peaks,
        classification: classifyTrajectory(run),
      });
      return;
    }

    const [vLo, vHi] = req.vRange;
    const n = Math.max(2, req.nPoints);
    for (let i = 0; i < n; i++) {
      const v = vLo + ((vHi - vLo) * i) / (n - 1);
      // A failed bisection at one velocity (bracket no longer straddles the
      // boundary) posts NaN for that point; the chart leaves a gap.
      let over = NaN;
      let under = NaN;
      try {
        over = findOvershootBoundary(capsule, v, OVERSHOOT_BRACKET, SWEEP_SIM);
        under = findUndershootBoundary(capsule, v, UNDERSHOOT_BRACKET, SWEEP_SIM);
      } catch {
        // leave NaN
      }
      post({
        kind: 'corridor-point',
        index: i,
        nPoints: n,
        vEntry: v,
        gammaOvershoot: over,
        gammaUndershoot: under,
      });
    }
    post({ kind: 'corridor-done' });
  } catch (e) {
    post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
