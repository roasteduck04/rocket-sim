/**
 * The signature entry-corridor chart (README §9 Module B): γ_entry vs V_entry
 * with the valid band shaded between the skip-out (overshoot) and burn-up
 * (undershoot) boundary curves, and a draggable entry-point marker giving
 * live inside/outside feedback while the user drags (README: "dragging it
 * should let the user see in real time whether they're inside or outside").
 *
 * Custom SVG (not Recharts) because the draggable marker + shaded band are
 * the whole point; axes/grid follow the same recessive-chrome rules.
 */

import { useRef, type JSX, type PointerEvent as ReactPointerEvent } from 'react';
import { AXIS, GRID, INK, MUTED, SERIES, STATUS } from '../../lib/palette';
import { radToDeg } from '../../lib/unitsDisplay';

export interface CorridorPointData {
  vEntry: number;
  /** Boundary γ in rad; NaN = bisection failed at this velocity. */
  gammaOvershoot: number;
  gammaUndershoot: number;
}

/** Marker verdict from the shaded band alone (no simulation). */
export type BandVerdict = 'inside' | 'skip-out' | 'exceeds-limits' | 'unknown';

const W = 640;
const H = 360;
const ML = 52;
const MR = 16;
const MT = 18;
const MB = 40;

/** Fixed chart domain: V_entry m/s (x), γ_entry deg (y, 0 at top, −7 bottom). */
const V_MIN = 7000;
const V_MAX = 8600;
const G_MIN_DEG = -7;
const G_MAX_DEG = 0;

const x = (v: number): number => ML + ((v - V_MIN) / (V_MAX - V_MIN)) * (W - ML - MR);
const y = (gDeg: number): number =>
  MT + ((G_MAX_DEG - gDeg) / (G_MAX_DEG - G_MIN_DEG)) * (H - MT - MB);
const vOf = (px: number): number =>
  Math.min(V_MAX, Math.max(V_MIN, V_MIN + ((px - ML) / (W - ML - MR)) * (V_MAX - V_MIN)));
const gOf = (py: number): number =>
  Math.min(
    G_MAX_DEG,
    Math.max(G_MIN_DEG, G_MAX_DEG - ((py - MT) / (H - MT - MB)) * (G_MAX_DEG - G_MIN_DEG)),
  );

/** Linear interpolation of a boundary at v over the finite corridor points. */
const boundaryAt = (
  pts: CorridorPointData[],
  v: number,
  key: 'gammaOvershoot' | 'gammaUndershoot',
): number => {
  const finite = pts.filter((p) => Number.isFinite(p[key]));
  if (finite.length < 2 || v < finite[0].vEntry || v > finite[finite.length - 1].vEntry) {
    return NaN;
  }
  for (let i = 1; i < finite.length; i++) {
    if (v <= finite[i].vEntry) {
      const a = finite[i - 1];
      const b = finite[i];
      const f = (v - a.vEntry) / (b.vEntry - a.vEntry);
      return a[key] + f * (b[key] - a[key]);
    }
  }
  return NaN;
};

export const bandVerdict = (
  pts: CorridorPointData[],
  vEntry: number,
  gammaRad: number,
): BandVerdict => {
  const over = boundaryAt(pts, vEntry, 'gammaOvershoot');
  const under = boundaryAt(pts, vEntry, 'gammaUndershoot');
  if (!Number.isFinite(over) || !Number.isFinite(under)) return 'unknown';
  if (gammaRad > over) return 'skip-out';
  if (gammaRad < under) return 'exceeds-limits';
  return 'inside';
};

const VERDICT_COLOR: Record<BandVerdict, string> = {
  inside: STATUS.good,
  'skip-out': STATUS.warning,
  'exceeds-limits': STATUS.critical,
  unknown: MUTED,
};

const curvePath = (pts: CorridorPointData[], key: 'gammaOvershoot' | 'gammaUndershoot'): string =>
  pts
    .filter((p) => Number.isFinite(p[key]))
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.vEntry).toFixed(1)},${y(radToDeg(p[key])).toFixed(1)}`)
    .join(' ');

export const CorridorChart = ({
  points,
  vEntry,
  gammaRad,
  onMarkerDrag,
  onMarkerCommit,
}: {
  points: CorridorPointData[];
  vEntry: number;
  gammaRad: number;
  /** Live while dragging (band feedback only — no simulation). */
  onMarkerDrag: (vEntry: number, gammaRad: number) => void;
  /** Pointer released: parent may auto-run the trajectory. */
  onMarkerCommit: () => void;
}): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const toChart = (ev: ReactPointerEvent): { v: number; g: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    // Fixed-size SVG (no viewBox scaling): client px map 1:1 to chart px.
    return { v: vOf(ev.clientX - rect.left), g: gOf(ev.clientY - rect.top) };
  };

  const verdict = bandVerdict(points, vEntry, gammaRad);
  const over = points.filter((p) => Number.isFinite(p.gammaOvershoot));
  const under = points.filter((p) => Number.isFinite(p.gammaUndershoot));

  // Shaded valid band: overshoot curve out, undershoot curve back.
  const band =
    over.length >= 2 && under.length >= 2
      ? [
          ...over.map((p) => `${x(p.vEntry).toFixed(1)},${y(radToDeg(p.gammaOvershoot)).toFixed(1)}`),
          ...[...under]
            .reverse()
            .map((p) => `${x(p.vEntry).toFixed(1)},${y(radToDeg(p.gammaUndershoot)).toFixed(1)}`),
        ].join(' ')
      : null;

  const vTicks = [7000, 7400, 7800, 8200, 8600];
  const gTicks = [0, -1, -2, -3, -4, -5, -6, -7];

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      role="application"
      aria-label="Entry corridor chart — drag the marker to set entry conditions"
      style={{ maxWidth: '100%', touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(ev) => {
        dragging.current = true;
        svgRef.current?.setPointerCapture(ev.pointerId);
        const { v, g } = toChart(ev);
        onMarkerDrag(v, (g * Math.PI) / 180);
      }}
      onPointerMove={(ev) => {
        if (!dragging.current) return;
        const { v, g } = toChart(ev);
        onMarkerDrag(v, (g * Math.PI) / 180);
      }}
      onPointerUp={(ev) => {
        if (!dragging.current) return;
        dragging.current = false;
        svgRef.current?.releasePointerCapture(ev.pointerId);
        onMarkerCommit();
      }}
    >
      <rect width={W} height={H} rx={10} fill="#0a0f16" stroke={AXIS} />
      {/* recessive grid */}
      {vTicks.map((v) => (
        <line key={v} x1={x(v)} y1={MT} x2={x(v)} y2={H - MB} stroke={GRID} />
      ))}
      {gTicks.map((g) => (
        <line key={g} x1={ML} y1={y(g)} x2={W - MR} y2={y(g)} stroke={GRID} />
      ))}
      {/* shaded valid band between the two boundaries */}
      {band && <polygon points={band} fill={SERIES.aqua} fillOpacity={0.16} stroke="none" />}
      {/* boundary curves, direct-labeled */}
      {over.length >= 2 && (
        <>
          <path d={curvePath(points, 'gammaOvershoot')} fill="none" stroke={SERIES.blue} strokeWidth={2} />
          <text
            x={x(over[over.length - 1].vEntry) - 4}
            y={y(radToDeg(over[over.length - 1].gammaOvershoot)) - 8}
            fill={SERIES.blue}
            fontSize={11}
            textAnchor="end"
          >
            skip-out boundary (overshoot)
          </text>
        </>
      )}
      {under.length >= 2 && (
        <>
          <path d={curvePath(points, 'gammaUndershoot')} fill="none" stroke={STATUS.serious} strokeWidth={2} />
          <text
            x={x(under[under.length - 1].vEntry) - 4}
            y={y(radToDeg(under[under.length - 1].gammaUndershoot)) + 16}
            fill={STATUS.serious}
            fontSize={11}
            textAnchor="end"
          >
            burn-up boundary (heat / g limits)
          </text>
        </>
      )}
      {/* axes labels + ticks */}
      {vTicks.map((v) => (
        <text key={v} x={x(v)} y={H - MB + 16} fill={MUTED} fontSize={11} textAnchor="middle">
          {v}
        </text>
      ))}
      {gTicks.map((g) => (
        <text key={g} x={ML - 8} y={y(g) + 4} fill={MUTED} fontSize={11} textAnchor="end">
          {g}°
        </text>
      ))}
      <text x={W - MR} y={H - 8} fill={MUTED} fontSize={11} textAnchor="end">
        V_entry (m/s)
      </text>
      <text x={ML + 6} y={MT + 12} fill={MUTED} fontSize={11}>
        γ_entry (deg)
      </text>
      {/* draggable entry-point marker with live verdict color */}
      <circle
        cx={x(vEntry)}
        cy={y(radToDeg(gammaRad))}
        r={9}
        fill={VERDICT_COLOR[verdict]}
        stroke={INK}
        strokeWidth={2}
        style={{ cursor: 'grab' }}
      />
    </svg>
  );
};
