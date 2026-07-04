/**
 * Ground-track map (README §9 Module B): the lat/lon trace in plate-carrée
 * projection, auto-fit to the track with a light graticule. Realistic entries
 * here span well under a hemisphere, so no antimeridian handling.
 */

import { useMemo, type JSX } from 'react';
import type { ReentryFrame } from '@fds/reentry-sim';
import { AXIS, GRID, INK, MUTED, SERIES, STATUS } from '../../lib/palette';
import { fmtKm, radToDeg } from '../../lib/unitsDisplay';
import type { TrajectoryClass } from '../../lib/simWorker';

const W = 640;
const H = 300;
const M = 34;

const CLASS_COLOR: Record<TrajectoryClass, string> = {
  landed: STATUS.good,
  skipped: STATUS.warning,
  'limits-exceeded': STATUS.critical,
};

/** Round a span to a pleasant graticule step. */
const niceStep = (spanDeg: number): number => {
  const raw = spanDeg / 5;
  const steps = [0.5, 1, 2, 5, 10, 15, 30];
  return steps.find((s) => s >= raw) ?? 30;
};

export const GroundTrackMap = ({
  history,
  classification,
}: {
  history: ReentryFrame[];
  classification: TrajectoryClass;
}): JSX.Element => {
  const { pts, lonTicks, latTicks, x, yPos } = useMemo(() => {
    const lons = history.map((f) => radToDeg(f.lon));
    const lats = history.map((f) => radToDeg(f.lat));
    const lonMin = Math.min(...lons);
    const lonMax = Math.max(...lons);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const padLon = Math.max(1, 0.1 * (lonMax - lonMin));
    const padLat = Math.max(1, 0.1 * (latMax - latMin));
    const lo = [lonMin - padLon, lonMax + padLon];
    const la = [latMin - padLat, latMax + padLat];
    const xf = (lon: number): number => M + ((lon - lo[0]) / (lo[1] - lo[0])) * (W - 2 * M);
    const yf = (lat: number): number => H - M - ((lat - la[0]) / (la[1] - la[0])) * (H - 2 * M);
    const stepLon = niceStep(lo[1] - lo[0]);
    const stepLat = niceStep(la[1] - la[0]);
    const ticks = (min: number, max: number, step: number): number[] => {
      const out: number[] = [];
      for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
      return out;
    };
    return {
      pts: history.map((f, i) => ({ x: xf(lons[i]), y: yf(lats[i]) })),
      lonTicks: ticks(lo[0], lo[1], stepLon),
      latTicks: ticks(la[0], la[1], stepLat),
      x: xf,
      yPos: yf,
    };
  }, [history]);

  const downrange = history.length > 0 ? history[history.length - 1].downrange : 0;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="chart-card panel">
      <h3>
        Ground track <span style={{ color: MUTED }}>· downrange {fmtKm(downrange, 0)} km</span>
      </h3>
      <svg width={W} height={H} role="img" aria-label="Ground track map" style={{ maxWidth: '100%' }}>
        <rect width={W} height={H} rx={10} fill="#0a0f16" stroke={AXIS} />
        {lonTicks.map((lon) => (
          <g key={`lon${lon}`}>
            <line x1={x(lon)} y1={M} x2={x(lon)} y2={H - M} stroke={GRID} />
            <text x={x(lon)} y={H - M + 14} fill={MUTED} fontSize={10} textAnchor="middle">
              {lon.toFixed(0)}°E
            </text>
          </g>
        ))}
        {latTicks.map((lat) => (
          <g key={`lat${lat}`}>
            <line
              x1={M}
              y1={yPos(lat)}
              x2={W - M}
              y2={yPos(lat)}
              stroke={lat === 0 ? AXIS : GRID}
            />
            <text x={M - 6} y={yPos(lat) + 3} fill={MUTED} fontSize={10} textAnchor="end">
              {lat.toFixed(0)}°
            </text>
          </g>
        ))}
        {pts.length > 1 && <path d={path} fill="none" stroke={SERIES.blue} strokeWidth={2} />}
        {pts.length > 0 && (
          <>
            <circle cx={pts[0].x} cy={pts[0].y} r={5} fill={INK} />
            <text x={pts[0].x + 8} y={pts[0].y - 6} fill={MUTED} fontSize={10}>
              entry interface
            </text>
            <circle
              cx={pts[pts.length - 1].x}
              cy={pts[pts.length - 1].y}
              r={6}
              fill={CLASS_COLOR[classification]}
              stroke={INK}
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
    </div>
  );
};
