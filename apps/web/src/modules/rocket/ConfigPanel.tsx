/**
 * Module A scenario panel: pick ascent vs landing burn and set the scenario
 * numbers the worker feeds to the validated §8.1 reference booster. Physics
 * parameters (PID gains, thrust curve, aero table) stay in the YAML config —
 * this panel only shapes the run.
 *
 * Phase 8 Stage 6: refit onto the Precision Instrument primitives (Panel,
 * NumberField with SI units + drag-to-scrub, Select, Button). Behavior is
 * unchanged — same fields, ranges, and run wiring.
 */

import type { JSX } from 'react';
import { Panel, NumberField, Select, Button } from '../../ui';

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
  <Panel title="Scenario — Reference TVC Booster">
    <Select
      label="Flight phase"
      value={mode}
      onChange={(m) => onMode(m as RocketMode)}
      options={[
        { value: 'ascent', label: 'Open-loop ascent' },
        { value: 'landing', label: 'Powered-descent landing' },
      ]}
    />
    {mode === 'ascent' ? (
      <>
        <NumberField
          label="Run time"
          unit="s"
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
        <NumberField
          label="Start altitude"
          unit="m"
          value={landing.altitudeM}
          onChange={(v) => onLanding({ ...landing, altitudeM: v })}
          step={100}
          min={200}
        />
        <NumberField
          label="Descent rate"
          unit="m/s"
          value={landing.descentRateMps}
          onChange={(v) => onLanding({ ...landing, descentRateMps: v })}
          step={5}
          min={0}
        />
        <NumberField
          label="East offset"
          unit="m"
          value={landing.eastOffsetM}
          onChange={(v) => onLanding({ ...landing, eastOffsetM: v })}
          step={10}
        />
        <NumberField
          label="East velocity"
          unit="m/s"
          value={landing.vEastMps}
          onChange={(v) => onLanding({ ...landing, vEastMps: v })}
          step={1}
        />
        <NumberField
          label="Propellant"
          unit="kg"
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
      <Button onClick={onRun} busy={busy}>
        {busy ? 'Running…' : 'Run simulation'}
      </Button>
    </div>
  </Panel>
);
