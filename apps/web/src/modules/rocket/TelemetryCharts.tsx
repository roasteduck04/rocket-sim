/**
 * Telemetry strip charts (README §9 Module A): altitude, velocity, Mach, q̄,
 * static margin, gimbal deflection — each on its own y-scale, with dashed
 * max-Q / max-g / apogee / burnout / ignition markers overlaid.
 */

import { useMemo, type JSX } from 'react';
import type { RunSummary, TelemetryFrame } from '@fds/rocket-sim';
import { TimeChart, type ChartRow, type RefLineSpec } from '../../lib/charts';
import { radToDeg } from '../../lib/unitsDisplay';
import { SERIES, STATUS } from '../../lib/palette';

/** Cap chart rows so a dt=0.01 run never renders thousands of points. */
const MAX_ROWS = 600;

const toRows = (telemetry: TelemetryFrame[]): ChartRow[] => {
  const stride = Math.max(1, Math.ceil(telemetry.length / MAX_ROWS));
  const rows: ChartRow[] = [];
  for (let i = 0; i < telemetry.length; i += stride) {
    const f = telemetry[i];
    rows.push({
      t: f.t,
      altKm: f.altitude / 1000,
      speed: f.speed,
      mach: f.mach,
      qbarKPa: f.qbar / 1000,
      margin: f.staticMargin,
      dpDeg: radToDeg(f.deltaP),
      dyDeg: radToDeg(f.deltaY),
      throttle: f.throttle,
    });
  }
  const last = telemetry[telemetry.length - 1];
  if (rows.length > 0 && rows[rows.length - 1].t !== last.t) {
    rows.push({
      t: last.t,
      altKm: last.altitude / 1000,
      speed: last.speed,
      mach: last.mach,
      qbarKPa: last.qbar / 1000,
      margin: last.staticMargin,
      dpDeg: radToDeg(last.deltaP),
      dyDeg: radToDeg(last.deltaY),
      throttle: last.throttle,
    });
  }
  return rows;
};

export const TelemetryCharts = ({
  telemetry,
  summary,
  mode,
}: {
  telemetry: TelemetryFrame[];
  summary: RunSummary;
  mode: 'ascent' | 'landing';
}): JSX.Element => {
  const rows = useMemo(() => toRows(telemetry), [telemetry]);

  const altMarkers: RefLineSpec[] = [];
  if (mode === 'ascent') {
    altMarkers.push({ x: summary.apogeeTime, label: 'apogee', color: SERIES.violet });
  }
  if (summary.burnoutTime !== null) {
    altMarkers.push({ x: summary.burnoutTime, label: 'burnout', color: STATUS.serious });
  }
  if (summary.landing?.ignitionTime != null) {
    altMarkers.push({ x: summary.landing.ignitionTime, label: 'ignition', color: STATUS.warning });
  }

  return (
    <div className="chart-grid">
      <TimeChart
        title="Altitude"
        unit="km"
        data={rows}
        series={[{ key: 'altKm', label: 'altitude', color: SERIES.blue }]}
        refLines={altMarkers}
      />
      <TimeChart
        title="Airspeed"
        unit="m/s"
        data={rows}
        series={[{ key: 'speed', label: 'airspeed', color: SERIES.blue }]}
        refLines={[
          {
            x: summary.maxAxialGTime,
            label: `max-g (${summary.maxAxialG.toFixed(1)} g)`,
            color: STATUS.critical,
          },
        ]}
      />
      <TimeChart
        title="Mach"
        data={rows}
        series={[{ key: 'mach', label: 'Mach', color: SERIES.blue }]}
      />
      <TimeChart
        title="Dynamic pressure q̄"
        unit="kPa"
        data={rows}
        series={[{ key: 'qbarKPa', label: 'q̄', color: SERIES.blue }]}
        refLines={[
          {
            x: summary.maxQbarTime,
            label: `max-Q (${(summary.maxQbar / 1000).toFixed(0)} kPa)`,
            color: SERIES.yellow,
          },
        ]}
      />
      <TimeChart
        title="Static margin"
        unit="calibers"
        data={rows}
        series={[{ key: 'margin', label: 'static margin', color: SERIES.blue }]}
        refLines={[{ y: 0, label: 'neutral', color: STATUS.warning }]}
      />
      <TimeChart
        title="Gimbal deflection"
        unit="deg"
        data={rows}
        series={[
          { key: 'dpDeg', label: 'δp (pitch)', color: SERIES.blue },
          { key: 'dyDeg', label: 'δy (yaw)', color: SERIES.aqua },
        ]}
      />
      {mode === 'landing' && (
        <TimeChart
          title="Throttle"
          unit="fraction"
          data={rows}
          series={[{ key: 'throttle', label: 'throttle', color: SERIES.blue }]}
          yDomain={[0, 1]}
        />
      )}
    </div>
  );
};
