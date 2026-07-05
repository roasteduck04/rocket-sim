/**
 * Module D batch-run worker (landing-sim spec §3): one full entry-descent run
 * at the real dt = 0.01 s, and the capture-region sweep — coarse dt, sparse
 * sampling, cells streamed one at a time so the selector shades in live
 * (same streaming pattern as corridor.worker.ts).
 */

import { runEntryDescentSim, type EntryScenario } from '@fds/rocket-sim';
import { referenceRocket } from '../lib/data';
import type { CaptureOutcome, LandingSimRequest, LandingSimResponse } from '../lib/simWorker';

const post = (msg: LandingSimResponse): void => (self as unknown as Worker).postMessage(msg);

/** Coarse sweep: dt 0.02 s (PID-safe), summary-only telemetry. */
const SWEEP = { dt: 0.02, sampleEvery: 100000 };

const classify = (scenario: EntryScenario): CaptureOutcome => {
  const cfg = referenceRocket();
  const { result } = runEntryDescentSim(cfg, scenario, SWEEP);
  const landing = result.summary.landing;
  const target = cfg.control?.landingTarget;
  const vzMax = target?.touchdownVzMaxMps ?? 2;
  const padR = target?.padRadiusM ?? 15;
  if (!landing?.touchedDown || Math.abs(landing.touchdownVz) > vzMax) return 'crashes';
  return landing.missDistance <= padR ? 'lands' : 'misses';
};

self.onmessage = (ev: MessageEvent<LandingSimRequest>): void => {
  const req = ev.data;
  try {
    if (req.kind === 'entry-run') {
      const run = runEntryDescentSim(referenceRocket(), req.scenario, {
        sampleEvery: req.sampleEvery,
      });
      post({
        kind: 'entry-result',
        telemetry: run.result.telemetry,
        summary: run.result.summary,
        entryBurnIgnitionTime: run.entryBurnIgnitionTime,
        entryBurnCutoffTime: run.entryBurnCutoffTime,
        landingIgnitionTime: run.landingIgnitionTime,
      });
      return;
    }

    const [vLo, vHi] = req.vRange;
    const [hLo, hHi] = req.hRange;
    for (let iH = 0; iH < req.nH; iH++) {
      for (let iV = 0; iV < req.nV; iV++) {
        const scenario: EntryScenario = {
          altitudeM: hLo + ((hHi - hLo) * iH) / (req.nH - 1),
          speedMps: vLo + ((vHi - vLo) * iV) / (req.nV - 1),
          gammaRad: req.gammaRad,
          downrangeM: req.downrangeM,
          propellantKg: req.propellantKg,
        };
        // A run that throws (degenerate state) counts as a crash cell.
        let outcome: CaptureOutcome = 'crashes';
        try {
          outcome = classify(scenario);
        } catch {
          /* leave 'crashes' */
        }
        post({ kind: 'capture-cell', iV, iH, outcome });
      }
    }
    post({ kind: 'capture-done' });
  } catch (e) {
    post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
