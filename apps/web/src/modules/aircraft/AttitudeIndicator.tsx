/**
 * SVG artificial horizon driven by θ and φ (README §6.4, §9). Standard
 * inside-out instrument signs: nose-up (+θ) shifts the horizon DOWN in the
 * view; right bank (+φ, right-wing-down) rotates the horizon counter-
 * clockwise on screen (SVG rotate is clockwise-positive → rotate by −φ).
 * Instrument colors are conventional sky/ground, not data-series colors.
 */

import type { JSX } from 'react';
import { AXIS, INK } from '../../lib/palette';
import { radToDeg } from '../../lib/unitsDisplay';

const SIZE = 230;
const C = SIZE / 2;
const R = C - 8;
/** Pitch-ladder scale, px per degree of θ. */
const PX_PER_DEG = 2.4;

const SKY = '#2a6fc2';
const GROUND = '#6b4a2b';

const LADDER = [-20, -10, 10, 20];

export const AttitudeIndicator = ({
  phiRad,
  thetaRad,
}: {
  phiRad: number;
  thetaRad: number;
}): JSX.Element => {
  const phiDeg = radToDeg(phiRad);
  const thetaPx = radToDeg(thetaRad) * PX_PER_DEG;
  return (
    <svg width={SIZE} height={SIZE} role="img" aria-label="Attitude indicator">
      <defs>
        <clipPath id="ai-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R + 4} fill="#0a0f16" stroke={AXIS} />
      <g clipPath="url(#ai-clip)">
        <g transform={`rotate(${-phiDeg} ${C} ${C}) translate(0 ${thetaPx})`}>
          {/* horizon card: sky above the line, ground below */}
          <rect x={-SIZE} y={-SIZE * 2} width={SIZE * 3} height={SIZE * 2 + C} fill={SKY} />
          <rect x={-SIZE} y={C} width={SIZE * 3} height={SIZE * 2} fill={GROUND} />
          <line x1={-SIZE} y1={C} x2={SIZE * 2} y2={C} stroke={INK} strokeWidth={2} />
          {/* pitch ladder: +10°/+20° above the horizon (smaller y) */}
          {LADDER.map((d) => {
            const y = C - d * PX_PER_DEG;
            const w = Math.abs(d) === 10 ? 26 : 40;
            return (
              <g key={d}>
                <line x1={C - w} y1={y} x2={C + w} y2={y} stroke={INK} strokeWidth={1.5} />
                <text x={C + w + 6} y={y + 4} fill={INK} fontSize={10}>
                  {d}
                </text>
              </g>
            );
          })}
        </g>
      </g>
      {/* fixed roll scale: ticks at ±30°, ±60° and a top reference triangle */}
      {[-60, -30, 0, 30, 60].map((b) => (
        <line
          key={b}
          x1={C + (R - 10) * Math.sin((b * Math.PI) / 180)}
          y1={C - (R - 10) * Math.cos((b * Math.PI) / 180)}
          x2={C + R * Math.sin((b * Math.PI) / 180)}
          y2={C - R * Math.cos((b * Math.PI) / 180)}
          stroke={INK}
          strokeWidth={b === 0 ? 3 : 1.5}
        />
      ))}
      {/* bank pointer rotates with the horizon card */}
      <g transform={`rotate(${-phiDeg} ${C} ${C})`}>
        <path
          d={`M${C},${C - R + 14} l -7,12 l 14,0 z`}
          fill="#f5c542"
        />
      </g>
      {/* fixed miniature aircraft */}
      <g stroke="#f5c542" strokeWidth={3} strokeLinecap="round">
        <line x1={C - 46} y1={C} x2={C - 14} y2={C} />
        <line x1={C + 14} y1={C} x2={C + 46} y2={C} />
        <line x1={C - 14} y1={C} x2={C - 6} y2={C + 8} />
        <line x1={C + 14} y1={C} x2={C + 6} y2={C + 8} />
      </g>
      <circle cx={C} cy={C} r={3} fill="#f5c542" />
    </svg>
  );
};
