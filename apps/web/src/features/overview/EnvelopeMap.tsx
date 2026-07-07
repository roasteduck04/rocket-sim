/**
 * The flight-envelope map — the Overview's signature.
 *
 * A flight-test plot of altitude (linear, 0–130 km) vs velocity (log, so a
 * ~60 m/s cruise and a ~7.8 km/s reentry share one chart). Each module is
 * plotted as its real operating regime (trajectory arc + a node); a node is a
 * launcher — hover/focus drops a crosshair to both axes with a Space Mono
 * readout, click enters the module. Colors and geometry come from ./modules.
 */

import { type JSX, type KeyboardEvent } from 'react';
import { OVERVIEW } from '../../lib/palette';
import { MODULES, type LaunchId } from './modules';

const DISPLAY = "'Saira Condensed', 'Saira', system-ui, sans-serif";
const MONO = "'Space Mono', ui-monospace, monospace";

const W = 580;
const H = 400;
const M = { l: 54, r: 20, t: 22, b: 46 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

const VMIN = 40;
const VMAX = 11000;
const HMAX = 130000;
const LG_MIN = Math.log10(VMIN);
const LG_SPAN = Math.log10(VMAX) - LG_MIN;

const px = (v: number): number => M.l + ((Math.log10(v) - LG_MIN) / LG_SPAN) * PW;
const py = (h: number): number => M.t + PH - (h / HMAX) * PH;

const X_TICKS: Array<[number, string]> = [
  [100, '100'],
  [1000, '1k'],
  [10000, '10k'],
];
const Y_TICKS: Array<[number, string]> = [
  [0, '0'],
  [40000, '40'],
  [80000, '80'],
  [120000, '120'],
];

const arcPath = (pts: ReadonlyArray<readonly [number, number]>): string =>
  pts.map(([v, h], i) => `${i ? 'L' : 'M'}${px(v).toFixed(1)} ${py(h).toFixed(1)}`).join(' ');

const fmtV = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(1)} km/s` : `${Math.round(v)} m/s`);
const fmtH = (h: number): string => `${Math.round(h / 1000)} km`;

export const EnvelopeMap = ({
  hovered,
  onHover,
  onEnter,
}: {
  hovered: LaunchId | null;
  onHover(id: LaunchId | null): void;
  onEnter(id: LaunchId): void;
}): JSX.Element => {
  const active = MODULES.find((m) => m.id === hovered) ?? null;

  const key = (e: KeyboardEvent, id: LaunchId): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEnter(id);
    }
  };

  return (
    <svg className="ov-envelope-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Flight envelope — click a regime to enter its module">
      <rect x={M.l} y={M.t} width={PW} height={PH} fill={OVERVIEW.void} stroke={OVERVIEW.line2} />

      {/* grid + axis ticks */}
      {X_TICKS.map(([v, label]) => (
        <g key={`x${v}`}>
          <line x1={px(v)} y1={M.t} x2={px(v)} y2={M.t + PH} stroke={OVERVIEW.line} />
          <text x={px(v)} y={M.t + PH + 16} fill={OVERVIEW.ink2} fontFamily={MONO} fontSize={10} textAnchor="middle">
            {label}
          </text>
        </g>
      ))}
      {Y_TICKS.map(([h, label]) => (
        <g key={`y${h}`}>
          <line x1={M.l} y1={py(h)} x2={M.l + PW} y2={py(h)} stroke={OVERVIEW.line} />
          <text x={M.l - 9} y={py(h) + 3.5} fill={OVERVIEW.ink2} fontFamily={MONO} fontSize={10} textAnchor="end">
            {label}
          </text>
        </g>
      ))}

      {/* axis titles */}
      <text x={M.l + PW / 2} y={H - 6} fill={OVERVIEW.muted} fontFamily={DISPLAY} fontSize={11} letterSpacing="0.14em" textAnchor="middle">
        VELOCITY · m/s (log)
      </text>
      <text
        x={15}
        y={M.t + PH / 2}
        fill={OVERVIEW.muted}
        fontFamily={DISPLAY}
        fontSize={11}
        letterSpacing="0.14em"
        textAnchor="middle"
        transform={`rotate(-90 15 ${M.t + PH / 2})`}
      >
        ALTITUDE · km
      </text>

      {/* crosshair + readout for the active regime */}
      {active && (
        <g pointerEvents="none">
          <line x1={px(active.node.v)} y1={py(active.node.h)} x2={px(active.node.v)} y2={M.t + PH} stroke={active.accent} strokeOpacity={0.5} strokeDasharray="3 3" />
          <line x1={M.l} y1={py(active.node.h)} x2={px(active.node.v)} y2={py(active.node.h)} stroke={active.accent} strokeOpacity={0.5} strokeDasharray="3 3" />
          <text x={M.l + 12} y={M.t + 21} fill={active.accent} fontFamily={DISPLAY} fontSize={14} fontWeight={600} letterSpacing="0.1em">
            {active.code} · {active.name.toUpperCase()}
          </text>
          <text x={M.l + 12} y={M.t + 38} fill={OVERVIEW.ink} fontFamily={MONO} fontSize={11}>
            {fmtH(active.node.h)} · {fmtV(active.node.v)}
          </text>
        </g>
      )}

      {/* module trajectories + node launchers */}
      {MODULES.map((m, i) => {
        const on = hovered === m.id;
        const nx = px(m.node.v);
        const ny = py(m.node.h);
        return (
          <g
            key={m.id}
            className="ov-wp"
            role="button"
            tabIndex={0}
            aria-label={`Enter Module ${m.code} — ${m.name}`}
            style={{ cursor: 'pointer', animationDelay: `${140 + i * 110}ms` }}
            onClick={() => onEnter(m.id)}
            onKeyDown={(e) => key(e, m.id)}
            onPointerEnter={() => onHover(m.id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(m.id)}
            onBlur={() => onHover(null)}
          >
            <path
              d={arcPath(m.arc)}
              fill="none"
              stroke={m.accent}
              strokeWidth={on ? 2.4 : 1.5}
              strokeOpacity={on ? 1 : 0.55}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {on && <circle cx={nx} cy={ny} r={11} fill={m.accent} opacity={0.16} />}
            <circle cx={nx} cy={ny} r={on ? 6 : 4.5} fill={m.accent} stroke={OVERVIEW.void} strokeWidth={1.5} />
            <text
              x={nx + 10}
              y={ny + 4}
              fill={on ? m.accent : OVERVIEW.ink2}
              fontFamily={DISPLAY}
              fontSize={13}
              fontWeight={600}
              letterSpacing="0.06em"
            >
              {m.code}
            </text>
            {/* generous transparent hit target */}
            <circle cx={nx} cy={ny} r={18} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
};
