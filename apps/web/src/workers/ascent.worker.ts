/**
 * Module A batch-run worker (plan Phase 6): full open-loop ascent or a
 * Phase-4 landing burn, computed off the UI thread with the exact package
 * code the test suite validates. One request → one result message.
 */

import { openLoopAscent, runLandingSim, runRocketSim } from '@fds/rocket-sim';
import { referenceRocket } from '../lib/data';
import type { RocketRequest, RocketResponse } from '../lib/simWorker';

// The DOM lib types `self` as Window; a dedicated worker's postMessage takes a
// single argument like Worker's, so the narrow cast keeps the payload typed.
const post = (msg: RocketResponse): void => (self as unknown as Worker).postMessage(msg);

self.onmessage = (ev: MessageEvent<RocketRequest>): void => {
  const req = ev.data;
  try {
    const cfg = referenceRocket();
    if (req.kind === 'ascent') {
      const { telemetry, summary } = runRocketSim(cfg, openLoopAscent(cfg), {
        maxTime: req.maxTime,
        sampleEvery: req.sampleEvery,
      });
      post({ kind: 'result', telemetry, summary });
    } else {
      const { telemetry, summary } = runLandingSim(cfg, req.scenario, {
        sampleEvery: req.sampleEvery,
      });
      post({ kind: 'result', telemetry, summary });
    }
  } catch (e) {
    post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
