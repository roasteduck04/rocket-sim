/**
 * D · Landing (landing-sim spec §3, §5): setup mode (entry selector fed by the
 * streamed capture sweep) → Launch → worker runs the whole descent headless →
 * flight mode plays the recording back — canvas + HUD + warp/scrub — and the
 * precomputed verdict is revealed only when playback reaches touchdown.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { referenceRocket } from '../../lib/data';
import {
  createLandingSimWorker,
  type EntryRunResult,
  type LandingSimResponse,
} from '../../lib/simWorker';
import { Dashboard } from './Dashboard';
import { MissionSpine } from './MissionSpine';
import { EntryPointSelector, ENTRY_RANGES } from './EntryPointSelector';
import { LandingCanvas, type TouchdownVisual } from './LandingCanvas';
import { usePlayback } from './usePlayback';
import { classifyLanding } from './verdict';
import type { CaptureGrid, EntryInputs, Verdict } from './types';

export const DEFAULT_INPUTS: EntryInputs = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-70 * Math.PI) / 180,
  downrangeM: 500,
  propellantKg: 1500,
};

const WARPS = [1, 2, 5, 10];

const emptyGrid = (): CaptureGrid => ({
  nV: ENTRY_RANGES.N_V,
  nH: ENTRY_RANGES.N_H,
  vRange: ENTRY_RANGES.V,
  hRange: ENTRY_RANGES.H,
  cells: Array.from({ length: ENTRY_RANGES.N_H }, () =>
    Array.from({ length: ENTRY_RANGES.N_V }, () => null),
  ),
  stale: true,
});

const VERDICT_TONE: Record<Verdict['kind'], string> = {
  success: 'is-good',
  'missed-pad': 'is-warn',
  'no-touchdown': 'is-warn',
  'hard-landing': 'is-crit',
  'tip-over': 'is-crit',
  'out-of-propellant': 'is-crit',
  rud: 'is-crit',
};

/** Flight-mode inner component so playback hooks mount only with a run. */
const Flight = ({
  run,
  inputs,
  onReset,
}: {
  run: EntryRunResult;
  inputs: EntryInputs;
  onReset(): void;
}): JSX.Element => {
  const cfg = useMemo(referenceRocket, []);
  const pb = usePlayback(run.telemetry, 5);
  const verdict = useMemo(
    () =>
      classifyLanding(
        run.summary.landing,
        run.telemetry[run.telemetry.length - 1],
        cfg,
      ),
    [run, cfg],
  );
  const touchdown: TouchdownVisual | null = pb.done
    ? { verdict, tSince: pb.tSim - pb.duration } // seconds past touchdown (clock overruns)
    : null;

  return (
    <div className="landing-flight">
      <div>
        <div className="landing-canvas-wrap">
          <LandingCanvas sample={pb.sample} touchdown={touchdown} />
          {pb.done && (
            <span className={`lc-verdict ${VERDICT_TONE[verdict.kind]}`}>
              <span className="lc-verdict-glyph">{verdict.kind === 'success' ? '✓' : '✗'}</span>
              {verdict.detail}
            </span>
          )}
          <div className="landing-controls">
            <button
              type="button"
              className="lc-btn lc-btn--play"
              onClick={pb.playing ? pb.pause : pb.play}
              aria-label={pb.playing ? 'Pause' : 'Play'}
            >
              {pb.playing ? '⏸' : '▶'}
            </button>
            {WARPS.map((w) => (
              <button
                key={w}
                type="button"
                className={`lc-btn${pb.warp === w ? ' is-active' : ''}`}
                aria-pressed={pb.warp === w}
                onClick={() => pb.setWarp(w)}
              >
                {w}×
              </button>
            ))}
            <input
              type="range"
              className="lc-scrub"
              min={0}
              max={pb.duration}
              step={0.1}
              value={pb.tSim}
              aria-label="Scrub playback"
              onChange={(e) => pb.seek(Number(e.target.value))}
            />
            <button type="button" className="lc-btn" onClick={pb.replay}>
              Replay
            </button>
            <button type="button" className="lc-btn" onClick={onReset}>
              ◀ New entry
            </button>
          </div>
        </div>
      </div>
      <div className="lc-rail">
        <MissionSpine t={pb.sample.t} times={run} duration={pb.duration} />
        <Dashboard
          sample={pb.sample}
          propellantKg0={inputs.propellantKg}
          dryKg={cfg.mass.dryKg}
        />
      </div>
    </div>
  );
};

export const LandingSimView = (): JSX.Element => {
  const [inputs, setInputs] = useState<EntryInputs>(DEFAULT_INPUTS);
  const [grid, setGrid] = useState<CaptureGrid>(emptyGrid);
  const [run, setRun] = useState<EntryRunResult | null>(null);
  const [awaitingRun, setAwaitingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const firstSweep = useRef(true);

  // One worker for the module's lifetime; jsdom-free environments skip it.
  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;
    const w = createLandingSimWorker();
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<LandingSimResponse>) => {
      const msg = ev.data;
      if (msg.kind === 'entry-result') {
        setAwaitingRun(false);
        setRun(msg);
      } else if (msg.kind === 'capture-cell') {
        setGrid((g) => {
          const cells = g.cells.map((row) => row.slice());
          cells[msg.iH][msg.iV] = msg.outcome;
          return { ...g, cells };
        });
      } else if (msg.kind === 'capture-done') {
        setGrid((g) => ({ ...g, stale: false }));
      } else if (msg.kind === 'error') {
        setAwaitingRun(false);
        setError(msg.message);
      }
    };
    return () => w.terminate();
  }, []);

  // Capture sweep on mount (immediate) and (debounced) when γ / downrange
  // change — the grid axes ARE v and h, so dragging the point never
  // invalidates it.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return undefined;
    setGrid((g) => ({ ...emptyGrid(), cells: g.cells, stale: true }));
    const post = (): void =>
      w.postMessage({
        kind: 'capture',
        gammaRad: inputs.gammaRad,
        downrangeM: inputs.downrangeM,
        propellantKg: inputs.propellantKg,
        vRange: ENTRY_RANGES.V,
        hRange: ENTRY_RANGES.H,
        nV: ENTRY_RANGES.N_V,
        nH: ENTRY_RANGES.N_H,
      });
    if (firstSweep.current) {
      firstSweep.current = false;
      post();
      return undefined;
    }
    const id = setTimeout(post, 300);
    return () => clearTimeout(id);
  }, [inputs.gammaRad, inputs.downrangeM, inputs.propellantKg]);

  const launch = (): void => {
    const w = workerRef.current;
    if (!w) return;
    setError(null);
    setAwaitingRun(true);
    w.postMessage({
      kind: 'entry-run',
      scenario: {
        altitudeM: inputs.altitudeM,
        speedMps: inputs.speedMps,
        gammaRad: inputs.gammaRad,
        downrangeM: inputs.downrangeM,
        propellantKg: inputs.propellantKg,
      },
      sampleEvery: 2,
    });
  };

  if (run) {
    return (
      <div className="landing-layout">
        <Flight run={run} inputs={inputs} onReset={() => setRun(null)} />
      </div>
    );
  }

  return (
    <div className="landing-layout">
      <EntryPointSelector
        inputs={inputs}
        grid={grid}
        onChange={setInputs}
        onLaunch={launch}
        disabled={awaitingRun}
      />
      {awaitingRun && <p className="lc-status">running the descent…</p>}
      {error && <p className="error-note">{error}</p>}
    </div>
  );
};
