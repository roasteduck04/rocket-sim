/**
 * Live telemetry HUD (landing-sim spec §7), styled as a flight-test console
 * readout: hairline-separated rows grouped kinematics / propulsion / attitude,
 * labels in the condensed display face and every value in tabular Space Mono.
 * Phase + the T-minus clock now live in the MissionSpine; `phaseAt` stays here
 * (it drives both the spine and the view tests).
 */

import { type JSX } from 'react';
import { fmt, fmtDeg, fmtKPa } from '../../lib/unitsDisplay';
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

const Row = ({
  k,
  value,
  unit,
  hot,
}: {
  k: string | JSX.Element;
  value: string;
  unit?: string;
  hot?: boolean;
}): JSX.Element => (
  <div className={`lc-row${hot ? ' is-hot' : ''}`}>
    <span className="lc-k">{k}</span>
    <span className="lc-val">
      <span className="lc-v">{value}</span>
      {unit && <span className="lc-u">{unit}</span>}
    </span>
  </div>
);

const Group = ({ title, children }: { title: string; children: JSX.Element[] }): JSX.Element => (
  <div className="lc-group">
    <p className="lc-group-title">{title}</p>
    {children}
  </div>
);

export const Dashboard = ({
  sample,
  propellantKg0,
  dryKg,
}: {
  sample: PlaybackSample;
  /** Propellant at entry, kg (for the remaining-% readout). */
  propellantKg0: number;
  dryKg: number;
}): JSX.Element => {
  const propPct = propellantKg0 > 0 ? (100 * (sample.mass - dryKg)) / propellantKg0 : 0;
  const vHoriz = Math.hypot(sample.vNED.x, sample.vNED.y);
  const burning = sample.throttle > 0.01;

  return (
    <div className="lc lc-readout">
      <p className="lc-eyebrow">Telemetry</p>
      <Group title="Kinematics">
        <Row k="Altitude" value={fmt(sample.altitudeM, 0)} unit="m AGL" />
        <Row k="V vertical" value={fmt(-sample.vNED.z, 1)} unit="m/s" />
        <Row k="V horizontal" value={fmt(vHoriz, 1)} unit="m/s" />
        <Row k="Speed" value={fmt(sample.speed, 1)} unit="m/s" />
        <Row k="Mach" value={fmt(sample.mach, 2)} />
        <Row k={<span className="lc-sym">q̄</span>} value={fmtKPa(sample.qbar)} unit="kPa" />
        <Row k="g-load" value={fmt(sample.gLoad, 2)} unit="g" />
      </Group>
      <Group title="Propulsion">
        <Row k="Throttle" value={fmt(sample.throttle * 100, 0)} unit="%" hot={burning} />
        <Row k="Propellant" value={fmt(Math.max(0, propPct), 1)} unit="%" />
      </Group>
      <Group title="Attitude">
        <Row k={<>Pitch <span className="lc-sym">θ</span></>} value={fmtDeg(sample.theta)} unit="°" />
        <Row k={<>Gimbal <span className="lc-sym">δp</span></>} value={fmtDeg(sample.deltaP, 2)} unit="°" />
        <Row k={<>Gimbal <span className="lc-sym">δy</span></>} value={fmtDeg(sample.deltaY, 2)} unit="°" />
      </Group>
    </div>
  );
};
