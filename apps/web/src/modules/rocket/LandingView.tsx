/**
 * Landing-leg touchdown view (README §9 Module A): plan-view of the touchdown
 * point vs the target with the horizontal velocity vector, plus the §4.7
 * landing metrics — touchdown v_z judged against the configured limit.
 */

import { useMemo, type JSX } from 'react';
import type { LandingSummary, TelemetryFrame } from '@fds/rocket-sim';
import { AXIS, GRID, INK, INK_2, MUTED, STATUS } from '../../lib/palette';
import { fmt, fmtS } from '../../lib/unitsDisplay';

const W = 260;
const H = 260;
const C = W / 2;

/**
 * Horizontal touchdown velocity (NED north/east) by finite difference of the
 * recorded NED positions — the terminal frame is always recorded exactly at
 * touchdown, so the last two frames bracket the final descent instant.
 */
const touchdownVelocity = (telemetry: TelemetryFrame[]): { vN: number; vE: number } => {
  if (telemetry.length < 2) return { vN: 0, vE: 0 };
  const a = telemetry[telemetry.length - 2];
  const b = telemetry[telemetry.length - 1];
  const dt = b.t - a.t;
  if (dt <= 0) return { vN: 0, vE: 0 };
  return { vN: (b.r.x - a.r.x) / dt, vE: (b.r.y - a.r.y) / dt };
};

const Stat = ({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value" style={tone ? { color: tone } : undefined}>
      {value}
    </span>
    <span className="unit">{unit}</span>
  </div>
);

export const LandingView = ({
  landing,
  telemetry,
  touchdownVzMax,
}: {
  landing: LandingSummary;
  telemetry: TelemetryFrame[];
  touchdownVzMax: number;
}): JSX.Element => {
  const { vN, vE } = useMemo(() => touchdownVelocity(telemetry), [telemetry]);
  const final = telemetry[telemetry.length - 1];
  const north = final?.r.x ?? 0;
  const east = final?.r.y ?? 0;

  // Plan view: screen x = East, screen y = −North (map convention, north up).
  const range = Math.max(10, 1.4 * Math.hypot(north, east));
  const px = (e: number): number => C + (e / range) * (W / 2 - 16);
  const py = (n: number): number => C - (n / range) * (H / 2 - 16);
  const tdX = px(east);
  const tdY = py(north);
  const vScale = (W / 2 - 16) / Math.max(5, Math.hypot(vN, vE) * 4);
  const vzOk = landing.touchedDown && Math.abs(landing.touchdownVz) <= touchdownVzMax;

  return (
    <div className="panel">
      <h2>Touchdown</h2>
      <div className="cockpit-row">
        <svg width={W} height={H} role="img" aria-label="Touchdown plan view">
          <rect width={W} height={H} rx={10} fill="#0a0f16" stroke={AXIS} />
          {/* range rings at half/full range with axis cross */}
          {[0.5, 1].map((r) => (
            <circle
              key={r}
              cx={C}
              cy={C}
              r={r * (W / 2 - 16)}
              fill="none"
              stroke={GRID}
            />
          ))}
          <line x1={C} y1={14} x2={C} y2={H - 14} stroke={GRID} />
          <line x1={14} y1={C} x2={W - 14} y2={C} stroke={GRID} />
          <text x={C + 4} y={20} fill={MUTED} fontSize={10}>
            N
          </text>
          <text x={W - 20} y={C - 6} fill={MUTED} fontSize={10}>
            E
          </text>
          <text x={16} y={H - 18} fill={MUTED} fontSize={10}>
            ring {fmt(range / 2, 0)} m
          </text>
          {/* target crosshair at the origin */}
          <g stroke={STATUS.good} strokeWidth={1.5}>
            <line x1={C - 8} y1={C} x2={C + 8} y2={C} />
            <line x1={C} y1={C - 8} x2={C} y2={C + 8} />
          </g>
          {/* horizontal velocity vector at the touchdown point */}
          {Math.hypot(vN, vE) > 0.05 && (
            <line
              x1={tdX}
              y1={tdY}
              x2={tdX + vE * vScale}
              y2={tdY - vN * vScale}
              stroke={INK_2}
              strokeWidth={2}
              markerEnd="url(#lv-arrow)"
            />
          )}
          <defs>
            <marker id="lv-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill={INK_2} />
            </marker>
          </defs>
          <circle
            cx={tdX}
            cy={tdY}
            r={6}
            fill={vzOk ? STATUS.good : STATUS.critical}
            stroke={INK}
            strokeWidth={1.5}
          />
        </svg>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ marginTop: 0 }}>
            {landing.touchedDown ? (
              <span className={`chip ${vzOk ? 'good' : 'critical'}`}>
                {vzOk ? '✓ soft touchdown' : '✗ hard touchdown'}
              </span>
            ) : (
              <span className="chip warning">no touchdown — time cap reached</span>
            )}
          </p>
          <div className="stat-grid">
            <Stat
              label="touchdown v_z"
              value={fmt(landing.touchdownVz, 2)}
              unit={`m/s (limit ${touchdownVzMax})`}
              tone={vzOk ? STATUS.good : STATUS.critical}
            />
            <Stat label="lateral speed" value={fmt(landing.touchdownLateralSpeed, 2)} unit="m/s" />
            <Stat label="miss distance" value={fmt(landing.missDistance, 2)} unit="m" />
            <Stat label="touchdown load" value={fmt(landing.touchdownG, 2)} unit="g" />
            <Stat
              label="ignition"
              value={landing.ignitionTime != null ? fmtS(landing.ignitionTime) : '–'}
              unit="s"
            />
            <Stat label="propellant used" value={fmt(landing.propellantUsedKg, 0)} unit="kg" />
          </div>
        </div>
      </div>
    </div>
  );
};
