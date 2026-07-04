/**
 * Module A view (README §9): scenario panel → Web-Worker batch run of the
 * validated rocket-sim pipeline → 3D trajectory, summary tiles, telemetry
 * strip charts, and (for descent runs) the landing touchdown view.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { RunSummary, TelemetryFrame } from '@fds/rocket-sim';
import { createRocketWorker, type RocketRequest, type RocketResponse } from '../../lib/simWorker';
import { referenceRocket } from '../../lib/data';
import {
  ConfigPanel,
  type AscentParams,
  type LandingParams,
  type RocketMode,
} from './ConfigPanel';
import { TrajectoryScene } from './TrajectoryScene';
import { TelemetryCharts } from './TelemetryCharts';
import { LandingView } from './LandingView';
import { fmt, fmtKm, fmtKPa, fmtS } from '../../lib/unitsDisplay';

interface RunData {
  telemetry: TelemetryFrame[];
  summary: RunSummary;
  /** Mode the run was made with (the selector may have changed since). */
  mode: RocketMode;
}

/** Golden-run landing scenario (Phase 4): 2 km, 120 m/s down, 60 m offset. */
const DEFAULT_LANDING: LandingParams = {
  altitudeM: 2000,
  descentRateMps: 120,
  eastOffsetM: 60,
  vEastMps: 0,
  propellantKg: 800,
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    <span className="unit">{unit}</span>
  </div>
);

export const RocketView = (): JSX.Element => {
  const [mode, setMode] = useState<RocketMode>('ascent');
  const [ascent, setAscent] = useState<AscentParams>({ maxTime: 11 });
  const [landing, setLanding] = useState<LandingParams>(DEFAULT_LANDING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunData | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const modeRef = useRef<RocketMode>(mode);

  const touchdownVzMax = useMemo(
    () => referenceRocket().control?.landingTarget?.touchdownVzMaxMps ?? 2.0,
    [],
  );

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const doRun = (): void => {
    if (!workerRef.current) {
      const w = createRocketWorker();
      w.onmessage = (ev: MessageEvent<RocketResponse>) => {
        setBusy(false);
        if (ev.data.kind === 'error') {
          setError(ev.data.message);
        } else {
          setError(null);
          setRun({
            telemetry: ev.data.telemetry,
            summary: ev.data.summary,
            mode: modeRef.current,
          });
        }
      };
      workerRef.current = w;
    }
    modeRef.current = mode;
    const req: RocketRequest =
      mode === 'ascent'
        ? { kind: 'ascent', maxTime: ascent.maxTime, sampleEvery: 2 }
        : {
            kind: 'landing',
            sampleEvery: 5,
            scenario: {
              altitudeM: landing.altitudeM,
              descentRateMps: landing.descentRateMps,
              eastM: landing.eastOffsetM,
              vEastMps: landing.vEastMps,
              propellantKg: landing.propellantKg,
            },
          };
    setBusy(true);
    workerRef.current.postMessage(req);
  };

  const s = run?.summary;

  return (
    <div className="module-grid">
      <aside className="stack">
        <ConfigPanel
          mode={mode}
          onMode={setMode}
          ascent={ascent}
          onAscent={setAscent}
          landing={landing}
          onLanding={setLanding}
          onRun={doRun}
          busy={busy}
        />
        {error && <p className="error-note">worker error: {error}</p>}
        {s && (
          <div className="panel">
            <h2>Run summary</h2>
            <div className="stat-grid">
              {run.mode === 'ascent' && (
                <Stat label="apogee" value={fmtKm(s.apogeeAltitude)} unit="km" />
              )}
              <Stat label="max Mach" value={fmt(s.maxMach, 2)} unit="" />
              <Stat label="max-Q" value={fmtKPa(s.maxQbar)} unit="kPa" />
              <Stat label="max axial" value={fmt(s.maxAxialG, 2)} unit="g" />
              <Stat label="max lateral" value={fmt(s.maxLateralG, 2)} unit="g" />
              <Stat
                label="burnout"
                value={s.burnoutTime !== null ? fmtS(s.burnoutTime) : '–'}
                unit="s"
              />
              <Stat label="flight time" value={fmtS(s.flightTime)} unit="s" />
            </div>
          </div>
        )}
      </aside>
      <section className="stack">
        <TrajectoryScene
          telemetry={run?.telemetry ?? []}
          summary={run?.summary ?? null}
          mode={run?.mode ?? mode}
        />
        {run?.summary.landing && (
          <LandingView
            landing={run.summary.landing}
            telemetry={run.telemetry}
            touchdownVzMax={touchdownVzMax}
          />
        )}
        {run ? (
          <TelemetryCharts telemetry={run.telemetry} summary={run.summary} mode={run.mode} />
        ) : (
          <p className="hint">Run a simulation to populate the telemetry charts.</p>
        )}
      </section>
    </div>
  );
};
