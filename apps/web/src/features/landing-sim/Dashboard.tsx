/**
 * Live telemetry HUD (landing-sim spec §7): every field from the current
 * playback sample; phase from the run's timestamps; T− countdown exact
 * (the recording is complete). Aerospace conventions per unitsDisplay/palette.
 */

import { type JSX } from 'react';
import { STATUS } from '../../lib/palette';
import { fmt, fmtDeg, fmtKPa, fmtS } from '../../lib/unitsDisplay';
import type { PlaybackSample } from './playbackMath';
import type { PhaseLabel, PhaseTimes } from './types';

export const phaseAt = (t: number, times: PhaseTimes, tTouchdown: number): PhaseLabel => {
  if (t >= tTouchdown) return 'TOUCHDOWN';
  if (times.landingIgnitionTime !== null && t >= times.landingIgnitionTime) return 'LANDING BURN';
  if (
    times.entryBurnIgnitionTime !== null &&
    t >= times.entryBurnIgnitionTime &&
    (times.entryBurnCutoffTime === null || t < times.entryBurnCutoffTime)
  ) {
    return 'ENTRY BURN';
  }
  return 'FREEFALL';
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    <span className="unit">{unit}</span>
  </div>
);

export const Dashboard = ({
  sample,
  times,
  duration,
  propellantKg0,
  dryKg,
}: {
  sample: PlaybackSample;
  times: PhaseTimes;
  duration: number;
  /** Propellant at entry, kg (for the remaining-% readout). */
  propellantKg0: number;
  dryKg: number;
}): JSX.Element => {
  const phase = phaseAt(sample.t, times, duration);
  const propPct = propellantKg0 > 0 ? (100 * (sample.mass - dryKg)) / propellantKg0 : 0;
  const vHoriz = Math.hypot(sample.vNED.x, sample.vNED.y);
  const burning = phase === 'ENTRY BURN' || phase === 'LANDING BURN';

  return (
    <div className="panel">
      <h2>Telemetry</h2>
      <p>
        <span
          className="chip"
          style={{ color: burning ? STATUS.warning : undefined }}
        >
          {phase}
        </span>{' '}
        <span className="chip">T−{fmtS(Math.max(0, duration - sample.t))} s</span>
      </p>
      <div className="stat-grid">
        <Stat label="altitude" value={fmt(sample.altitudeM, 0)} unit="m AGL" />
        <Stat label="v vertical" value={fmt(-sample.vNED.z, 1)} unit="m/s" />
        <Stat label="v horizontal" value={fmt(vHoriz, 1)} unit="m/s" />
        <Stat label="speed" value={fmt(sample.speed, 1)} unit="m/s" />
        <Stat label="Mach" value={fmt(sample.mach, 2)} unit="" />
        <Stat label="q̄" value={fmtKPa(sample.qbar)} unit="kPa" />
        <Stat label="g-load" value={fmt(sample.gLoad, 2)} unit="g" />
        <Stat label="throttle" value={fmt(sample.throttle * 100, 0)} unit="%" />
        <Stat label="propellant" value={fmt(Math.max(0, propPct), 1)} unit="%" />
        <Stat label="pitch θ" value={fmtDeg(sample.theta)} unit="°" />
        <Stat label="gimbal δp" value={fmtDeg(sample.deltaP, 2)} unit="°" />
        <Stat label="gimbal δy" value={fmtDeg(sample.deltaY, 2)} unit="°" />
      </div>
    </div>
  );
};
