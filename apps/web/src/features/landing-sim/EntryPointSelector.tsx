/**
 * Draggable entry-point input (landing-sim spec §5): SVG plot — x entry speed,
 * y entry altitude — with the streamed capture-region grid shaded behind the
 * point (green lands / amber misses / red crashes, greyed while stale), plus
 * γ and downrange sliders. SVG is right here: static plot, pointer-driven
 * (the live animation is the canvas's job).
 */

import { useRef, type JSX, type PointerEvent } from 'react';
import { AXIS, GRID, INK, MUTED, STATUS } from '../../lib/palette';
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

  return (
    <div className="panel">
      <h2>Entry point</h2>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        role="application"
        aria-label="Entry point selector"
        style={{ touchAction: 'none', cursor: 'crosshair', maxWidth: '100%' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragTo(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) dragTo(e);
        }}
      >
        <rect width={W} height={H} rx={10} fill="#0a0f16" stroke={AXIS} />
        {/* capture-region shading, [iH][iV], greyed while a fresh sweep streams */}
        <g opacity={grid.stale ? 0.12 : 0.3}>
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
        {/* axes */}
        <line x1={M.l} y1={M.t + PH} x2={M.l + PW} y2={M.t + PH} stroke={GRID} />
        <line x1={M.l} y1={M.t} x2={M.l} y2={M.t + PH} stroke={GRID} />
        <text x={M.l + PW / 2} y={H - 12} fill={MUTED} fontSize={11} textAnchor="middle">
          entry speed (m/s)
        </text>
        <text
          x={16}
          y={M.t + PH / 2}
          fill={MUTED}
          fontSize={11}
          textAnchor="middle"
          transform={`rotate(-90 16 ${M.t + PH / 2})`}
        >
          entry altitude (km)
        </text>
        <text x={M.l - 6} y={py(hLo) + 4} fill={MUTED} fontSize={10} textAnchor="end">
          {fmtKm(hLo, 0)}
        </text>
        <text x={M.l - 6} y={py(hHi) + 4} fill={MUTED} fontSize={10} textAnchor="end">
          {fmtKm(hHi, 0)}
        </text>
        <text x={px(vLo)} y={M.t + PH + 14} fill={MUTED} fontSize={10} textAnchor="middle">
          {vLo}
        </text>
        <text x={px(vHi)} y={M.t + PH + 14} fill={MUTED} fontSize={10} textAnchor="middle">
          {vHi}
        </text>
        {/* the draggable entry point */}
        <circle
          cx={px(inputs.speedMps)}
          cy={py(inputs.altitudeM)}
          r={7}
          fill={INK}
          stroke={STATUS.good}
          strokeWidth={2}
        />
      </svg>
      <div className="field">
        <label>
          flight-path angle γ: {fmtDeg(inputs.gammaRad)}°
          <input
            type="range"
            min={ENTRY_RANGES.GAMMA_DEG[0]}
            max={ENTRY_RANGES.GAMMA_DEG[1]}
            step={1}
            value={Math.round((inputs.gammaRad * 180) / Math.PI)}
            onChange={(e) => onChange({ ...inputs, gammaRad: degToRad(Number(e.target.value)) })}
          />
        </label>
      </div>
      <div className="field">
        <label>
          downrange offset: {fmtKm(inputs.downrangeM)} km
          <input
            type="range"
            min={ENTRY_RANGES.DOWNRANGE[0]}
            max={ENTRY_RANGES.DOWNRANGE[1]}
            step={100}
            value={inputs.downrangeM}
            onChange={(e) => onChange({ ...inputs, downrangeM: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onLaunch} disabled={disabled}>
          Launch
        </button>
        <span className="hint">
          {grid.stale ? 'computing capture region…' : 'green = lands on pad · amber = misses · red = crashes'}
        </span>
      </div>
    </div>
  );
};
