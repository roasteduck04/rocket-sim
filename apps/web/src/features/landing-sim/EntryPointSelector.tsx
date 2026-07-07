/**
 * Draggable entry-point input (landing-sim spec §5), styled as a flight-test
 * ENVELOPE instrument: an SVG plot — x entry speed, y entry altitude — with the
 * streamed capture-region grid shaded behind (green lands / amber misses / red
 * crashes, greyed while stale), tick marks + Space Mono axis numerics, and a
 * crosshair reticle marking the current entry state. γ and downrange are console
 * sliders with mono readouts. SVG is right here: static plot, pointer-driven
 * (the live animation is the canvas's job).
 */

import { useRef, type JSX, type PointerEvent } from 'react';
import { LANDING, STATUS } from '../../lib/palette';
import { degToRad, fmtDeg, fmtKm } from '../../lib/unitsDisplay';
import type { CaptureGrid, CaptureOutcome, EntryInputs } from './types';

export const ENTRY_RANGES = {
  V: [150, 800] as [number, number],
  H: [6000, 25000] as [number, number],
  GAMMA_DEG: [-88, -35] as [number, number],
  DOWNRANGE: [0, 8000] as [number, number],
  N_V: 12,
  N_H: 10,
};

const W = 460;
const H = 300;
const M = { l: 52, r: 14, t: 14, b: 40 }; // plot margins
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const MONO = "'Space Mono', ui-monospace, monospace";

const CELL_FILL: Record<CaptureOutcome, string> = {
  lands: STATUS.good,
  misses: STATUS.warning,
  crashes: STATUS.critical,
};

export const EntryPointSelector = ({
  inputs,
  grid,
  onChange,
  onLaunch,
  disabled,
}: {
  inputs: EntryInputs;
  grid: CaptureGrid;
  onChange(next: EntryInputs): void;
  onLaunch(): void;
  disabled: boolean;
}): JSX.Element => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vLo, vHi] = ENTRY_RANGES.V;
  const [hLo, hHi] = ENTRY_RANGES.H;
  const vMid = (vLo + vHi) / 2;
  const hMid = (hLo + hHi) / 2;

  const px = (v: number): number => M.l + ((v - vLo) / (vHi - vLo)) * PW;
  const py = (h: number): number => M.t + PH - ((h - hLo) / (hHi - hLo)) * PH;

  const dragTo = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = svgRef.current!.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) * (W / rect.width) - M.l) / PW;
    const fy = (M.t + PH - (e.clientY - rect.top) * (H / rect.height)) / PH;
    onChange({
      ...inputs,
      speedMps: Math.min(vHi, Math.max(vLo, vLo + fx * (vHi - vLo))),
      altitudeM: Math.min(hHi, Math.max(hLo, hLo + fy * (hHi - hLo))),
    });
  };

  const cellW = PW / grid.nV;
  const cellH = PH / grid.nH;
  const cx = px(inputs.speedMps);
  const cy = py(inputs.altitudeM);

  return (
    <div className="lc lc-envelope">
      <p className="lc-eyebrow">Flight Envelope</p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label="Entry point selector"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragTo(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) dragTo(e);
        }}
      >
        <rect x={0} y={0} width={W} height={H} rx={4} fill={LANDING.void} stroke={LANDING.muted} strokeOpacity={0.35} />
        {/* capture-region shading, [iH][iV], greyed while a fresh sweep streams */}
        <g opacity={grid.stale ? 0.12 : 0.34}>
          {grid.cells.map((row, iH) =>
            row.map((cell, iV) =>
              cell === null ? null : (
                <rect
                  key={`${iH}-${iV}`}
                  x={M.l + iV * cellW}
                  y={M.t + PH - (iH + 1) * cellH}
                  width={cellW}
                  height={cellH}
                  fill={CELL_FILL[cell]}
                />
              ),
            ),
          )}
        </g>
        {/* plot frame + axis rules */}
        <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke={LANDING.muted} strokeOpacity={0.4} />
        {/* x ticks */}
        {[vLo, vMid, vHi].map((v) => (
          <g key={`vx${v}`}>
            <line x1={px(v)} y1={M.t + PH} x2={px(v)} y2={M.t + PH + 5} stroke={LANDING.muted} />
            <text x={px(v)} y={M.t + PH + 17} fill={LANDING.ink2} fontFamily={MONO} fontSize={10} textAnchor="middle">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* y ticks */}
        {[hLo, hMid, hHi].map((h) => (
          <g key={`hy${h}`}>
            <line x1={M.l - 5} y1={py(h)} x2={M.l} y2={py(h)} stroke={LANDING.muted} />
            <text x={M.l - 8} y={py(h) + 3.5} fill={LANDING.ink2} fontFamily={MONO} fontSize={10} textAnchor="end">
              {fmtKm(h, 0)}
            </text>
          </g>
        ))}
        {/* axis titles */}
        <text x={M.l + PW / 2} y={H - 6} fill={LANDING.muted} fontFamily={MONO} fontSize={9.5} textAnchor="middle" letterSpacing="0.08em">
          ENTRY SPEED · m/s
        </text>
        <text
          x={13}
          y={M.t + PH / 2}
          fill={LANDING.muted}
          fontFamily={MONO}
          fontSize={9.5}
          textAnchor="middle"
          letterSpacing="0.08em"
          transform={`rotate(-90 13 ${M.t + PH / 2})`}
        >
          ENTRY ALT · km
        </text>
        {/* crosshair reticle at the entry state */}
        <g pointerEvents="none">
          <line x1={M.l} y1={cy} x2={M.l + PW} y2={cy} stroke={LANDING.amber} strokeOpacity={0.25} strokeDasharray="3 3" />
          <line x1={cx} y1={M.t} x2={cx} y2={M.t + PH} stroke={LANDING.amber} strokeOpacity={0.25} strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r={7} fill="none" stroke={LANDING.amber} strokeWidth={1.5} />
          <line x1={cx - 11} y1={cy} x2={cx - 4} y2={cy} stroke={LANDING.amber} strokeWidth={1.5} />
          <line x1={cx + 4} y1={cy} x2={cx + 11} y2={cy} stroke={LANDING.amber} strokeWidth={1.5} />
          <line x1={cx} y1={cy - 11} x2={cx} y2={cy - 4} stroke={LANDING.amber} strokeWidth={1.5} />
          <line x1={cx} y1={cy + 4} x2={cx} y2={cy + 11} stroke={LANDING.amber} strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={1.6} fill={LANDING.amber} />
        </g>
      </svg>

      <div className="lc-slider">
        <span className="lc-slider-k">
          Flight-path angle <span className="lc-sym">γ</span>
        </span>
        <span className="lc-slider-v">{fmtDeg(inputs.gammaRad)}°</span>
        <input
          type="range"
          min={ENTRY_RANGES.GAMMA_DEG[0]}
          max={ENTRY_RANGES.GAMMA_DEG[1]}
          step={1}
          value={Math.round((inputs.gammaRad * 180) / Math.PI)}
          aria-label="Flight-path angle"
          onChange={(e) => onChange({ ...inputs, gammaRad: degToRad(Number(e.target.value)) })}
        />
      </div>
      <div className="lc-slider">
        <span className="lc-slider-k">Downrange offset</span>
        <span className="lc-slider-v">{fmtKm(inputs.downrangeM)} km</span>
        <input
          type="range"
          min={ENTRY_RANGES.DOWNRANGE[0]}
          max={ENTRY_RANGES.DOWNRANGE[1]}
          step={100}
          value={inputs.downrangeM}
          aria-label="Downrange offset"
          onChange={(e) => onChange({ ...inputs, downrangeM: Number(e.target.value) })}
        />
      </div>

      <div className="lc-launch-row">
        <button type="button" className="lc-launch" onClick={onLaunch} disabled={disabled}>
          Launch
        </button>
        {grid.stale ? (
          <span className="lc-status">computing capture region…</span>
        ) : (
          <span className="lc-legend">
            <span className="k-lands"><b>▪</b> Lands</span>
            <span className="k-miss"><b>▪</b> Misses</span>
            <span className="k-crash"><b>▪</b> Crashes</span>
          </span>
        )}
      </div>
    </div>
  );
};
