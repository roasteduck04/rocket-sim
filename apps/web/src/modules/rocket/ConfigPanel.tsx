/**
 * Module A scenario panel: pick ascent vs landing burn and set the scenario
 * numbers the worker feeds to the validated §8.1 reference booster. Physics
 * parameters (PID gains, thrust curve, aero table) stay in the YAML config —
 * this panel only shapes the run.
 */

import type { JSX } from 'react';

export type RocketMode = 'ascent' | 'landing';

export interface AscentParams {
  /** Run cap, s — the reference booster is open-loop stable to t ≈ 11 s. */
  maxTime: number;
}

export interface LandingParams {
  altitudeM: number;
  descentRateMps: number;
  eastOffsetM: number;
  vEastMps: number;
  propellantKg: number;
}

const Num = ({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}): JSX.Element => (
  <div className="field">
    <label>{label}</label>
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  </div>
);

export const ConfigPanel = ({
  mode,
  onMode,
  ascent,
  onAscent,
  landing,
  onLanding,
  onRun,
  busy,
}: {
  mode: RocketMode;
  onMode: (m: RocketMode) => void;
  ascent: AscentParams;
  onAscent: (p: AscentParams) => void;
  landing: LandingParams;
  onLanding: (p: LandingParams) => void;
  onRun: () => void;
  busy: boolean;
}): JSX.Element => (
  <div className="panel">
    <h2>Scenario — Reference TVC Booster</h2>
    <div className="field">
      <label>Flight phase</label>
      <select value={mode} onChange={(e) => onMode(e.target.value as RocketMode)}>
        <option value="ascent">Open-loop ascent</option>
        <option value="landing">Powered-descent landing</option>
      </select>
    </div>
    {mode === 'ascent' ? (
      <>
        <Num
          label="Run time (s)"
          value={ascent.maxTime}
          onChange={(maxTime) => onAscent({ maxTime })}
          min={1}
          max={60}
        />
        <p className="hint">
          Open-loop gravity turn (README §4.6 mode 1). The §8.1 booster's static margin goes
          negative as propellant drains aft — beyond ~12 s it genuinely tumbles, which is the
          physics that motivates TVC.
        </p>
      </>
    ) : (
      <>
        <Num
          label="Start altitude (m)"
          value={landing.altitudeM}
          onChange={(v) => onLanding({ ...landing, altitudeM: v })}
          step={100}
          min={200}
        />
        <Num
          label="Descent rate (m/s)"
          value={landing.descentRateMps}
          onChange={(v) => onLanding({ ...landing, descentRateMps: v })}
          step={5}
          min={0}
        />
        <Num
          label="East offset (m)"
          value={landing.eastOffsetM}
          onChange={(v) => onLanding({ ...landing, eastOffsetM: v })}
          step={10}
        />
        <Num
          label="East velocity (m/s)"
          value={landing.vEastMps}
          onChange={(v) => onLanding({ ...landing, vEastMps: v })}
          step={1}
        />
        <Num
          label="Propellant (kg)"
          value={landing.propellantKg}
          onChange={(v) => onLanding({ ...landing, propellantKg: v })}
          step={50}
          min={50}
        />
        <p className="hint">
          Suicide-burn guidance (README §4.6 mode 3): ignition at h = v²/(2·a_max)·(1+margin),
          velocity-profile tracking → throttle, position PID → tilt.
        </p>
      </>
    )}
    <div className="btn-row">
      <button type="button" className="btn" onClick={onRun} disabled={busy}>
        {busy ? 'Running…' : 'Run simulation'}
      </button>
    </div>
  </div>
);
