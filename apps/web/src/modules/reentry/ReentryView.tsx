/**
 * Module B view (README §9): entry-condition controls + the draggable
 * corridor chart, trajectory/heating/g-load charts, and the ground track.
 * Two dedicated workers — single runs and the corridor sweep — so a long
 * sweep never queues behind (or blocks) an interactive run.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { ReentryFrame, ReentryPeaks } from '@fds/reentry-sim';
import { genericCapsule } from '../../lib/data';
import {
  createReentryWorker,
  type CorridorRequest,
  type ReentryResponse,
  type ReentryRunRequest,
  type TrajectoryClass,
} from '../../lib/simWorker';
import { degToRad, fmt, fmtKm, fmtMWm2, fmtS } from '../../lib/unitsDisplay';
import { CorridorChart, bandVerdict, type CorridorPointData } from './CorridorChart';
import { HeatGLoadCharts } from './HeatGLoadCharts';
import { AltVelChart } from './AltVelChart';
import { GroundTrackMap } from './GroundTrackMap';

interface RunData {
  history: ReentryFrame[];
  peaks: ReentryPeaks;
  classification: TrajectoryClass;
}

/** Sweep range probed in the Phase-5 corridor tests (skips exist here). */
const SWEEP_RANGE: [number, number] = [7700, 7900];
const SWEEP_POINTS = 5;

const CLASS_CHIP: Record<TrajectoryClass, { cls: string; label: string }> = {
  landed: { cls: 'good', label: '✓ landed inside limits' },
  skipped: { cls: 'warning', label: '↗ skipped out' },
  'limits-exceeded': { cls: 'critical', label: '✗ exceeded heat / g limits' },
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    <span className="unit">{unit}</span>
  </div>
);

export const ReentryView = (): JSX.Element => {
  const capsule = useMemo(() => genericCapsule(), []);
  const [gammaDeg, setGammaDeg] = useState(-3.0);
  const [vEntry, setVEntry] = useState(7800);
  const [run, setRun] = useState<RunData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corridor, setCorridor] = useState<CorridorPointData[]>([]);
  const [sweepDone, setSweepDone] = useState(0);
  const [sweeping, setSweeping] = useState(false);

  const runWorker = useRef<Worker | null>(null);
  const sweepWorker = useRef<Worker | null>(null);

  useEffect(
    () => () => {
      runWorker.current?.terminate();
      sweepWorker.current?.terminate();
      runWorker.current = null;
      sweepWorker.current = null;
    },
    [],
  );

  const doRun = (gRad: number, v: number): void => {
    if (!runWorker.current) {
      const w = createReentryWorker();
      w.onmessage = (ev: MessageEvent<ReentryResponse>) => {
        const msg = ev.data;
        if (msg.kind === 'error') {
          setBusy(false);
          setError(msg.message);
        } else if (msg.kind === 'run-result') {
          setBusy(false);
          setError(null);
          setRun({ history: msg.history, peaks: msg.peaks, classification: msg.classification });
        }
      };
      runWorker.current = w;
    }
    const req: ReentryRunRequest = { kind: 'run', gammaRad: gRad, vEntryMps: v, sampleEvery: 2 };
    setBusy(true);
    runWorker.current.postMessage(req);
  };

  const doSweep = (): void => {
    if (sweeping) return;
    if (!sweepWorker.current) {
      const w = createReentryWorker();
      w.onmessage = (ev: MessageEvent<ReentryResponse>) => {
        const msg = ev.data;
        if (msg.kind === 'corridor-point') {
          setCorridor((prev) =>
            [...prev.filter((p) => p.vEntry !== msg.vEntry), {
              vEntry: msg.vEntry,
              gammaOvershoot: msg.gammaOvershoot,
              gammaUndershoot: msg.gammaUndershoot,
            }].sort((a, b) => a.vEntry - b.vEntry),
          );
          setSweepDone(msg.index + 1);
        } else if (msg.kind === 'corridor-done') {
          setSweeping(false);
        } else if (msg.kind === 'error') {
          setSweeping(false);
          setError(msg.message);
        }
      };
      sweepWorker.current = w;
    }
    const req: CorridorRequest = { kind: 'corridor', vRange: SWEEP_RANGE, nPoints: SWEEP_POINTS };
    setCorridor([]);
    setSweepDone(0);
    setSweeping(true);
    sweepWorker.current.postMessage(req);
  };

  const gammaRad = degToRad(gammaDeg);
  const verdict = bandVerdict(corridor, vEntry, gammaRad);
  const p = run?.peaks;

  return (
    <div className="module-grid">
      <aside className="stack">
        <div className="panel">
          <h2>Entry conditions — {capsule.name}</h2>
          <div className="field">
            <label>γ_entry (deg)</label>
            <input
              type="number"
              value={gammaDeg}
              step={0.1}
              min={-7}
              max={0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setGammaDeg(v);
              }}
            />
          </div>
          <div className="field">
            <label>V_entry (m/s)</label>
            <input
              type="number"
              value={vEntry}
              step={50}
              min={7000}
              max={8600}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setVEntry(v);
              }}
            />
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => doRun(gammaRad, vEntry)} disabled={busy}>
              {busy ? 'Running…' : 'Run entry'}
            </button>
            <button type="button" className="btn secondary" onClick={doSweep} disabled={sweeping}>
              {sweeping ? `Corridor ${sweepDone}/${SWEEP_POINTS}…` : 'Compute corridor'}
            </button>
          </div>
          <p className="hint">
            Full lift-up (bank 0), due-East entry at the equator from the {capsule.entryInterfaceAltitudeM / 1000} km
            interface. Drag the marker on the corridor chart — release to fly that entry.
          </p>
          {error && <p className="error-note">worker error: {error}</p>}
        </div>
        {run && (
          <div className="panel">
            <h2>Run result</h2>
            <p style={{ marginTop: 0 }}>
              <span className={`chip ${CLASS_CHIP[run.classification].cls}`}>
                {CLASS_CHIP[run.classification].label}
              </span>
            </p>
            {p && (
              <div className="stat-grid">
                <Stat label="peak q̇ₛ" value={fmtMWm2(p.qdotSMax)} unit="MW/m²" />
                <Stat label="@ time" value={fmtS(p.tAtQdotSMax)} unit="s" />
                <Stat label="peak n" value={fmt(p.nMax, 2)} unit="g" />
                <Stat label="@ time" value={fmtS(p.tAtNMax)} unit="s" />
                <Stat label="heat load" value={fmt(p.qTotalJm2 / 1e6, 0)} unit="MJ/m²" />
                <Stat label="downrange" value={fmtKm(p.downrangeM, 0)} unit="km" />
                <Stat label="flight time" value={fmtS(p.flightTimeS, 0)} unit="s" />
                <Stat label="V at end" value={fmt(p.speedAtTerminationMps, 0)} unit="m/s" />
              </div>
            )}
          </div>
        )}
      </aside>
      <section className="stack">
        <div className="panel chart-card">
          <h3>
            Entry corridor{' '}
            <span className={`chip ${verdict === 'inside' ? 'good' : verdict === 'unknown' ? 'neutral' : verdict === 'skip-out' ? 'warning' : 'critical'}`}>
              {verdict === 'unknown' ? 'compute corridor for live feedback' : verdict}
            </span>
          </h3>
          <CorridorChart
            points={corridor}
            vEntry={vEntry}
            gammaRad={gammaRad}
            onMarkerDrag={(v, g) => {
              setVEntry(Math.round(v));
              setGammaDeg(Number(((g * 180) / Math.PI).toFixed(2)));
            }}
            onMarkerCommit={() => doRun(gammaRad, vEntry)}
          />
        </div>
        {run ? (
          <div className="chart-grid">
            <AltVelChart history={run.history} />
            <HeatGLoadCharts history={run.history} limits={capsule.limits} />
            <GroundTrackMap history={run.history} classification={run.classification} />
          </div>
        ) : (
          <p className="hint">Run an entry to populate the trajectory, heating, and ground-track charts.</p>
        )}
      </section>
    </div>
  );
};
