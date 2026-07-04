/**
 * Virtual stick + rudder (README §6.4). Stick pad: drag sets roll (x) and
 * pitch (y, drag DOWN = pull = nose-up command, matching flight-sim sticks);
 * release springs back to center. Rudder is a spring-return slider. Keyboard
 * bindings live in AircraftView and are summed with this widget's values —
 * the dot shows the combined command.
 */

import { useRef, type JSX, type PointerEvent as ReactPointerEvent } from 'react';
import { AXIS, GRID, INK_2, MUTED, SERIES } from '../../lib/palette';

const PAD = 150;
const C = PAD / 2;
const TRAVEL = C - 14;

export const StickWidget = ({
  roll,
  pitch,
  rudder,
  onStick,
  onRudder,
}: {
  /** Combined commanded values in −1..1 (display). */
  roll: number;
  pitch: number;
  rudder: number;
  /** Pointer-stick command; (0,0) on release. */
  onStick: (roll: number, pitch: number) => void;
  onRudder: (rudder: number) => void;
}): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const toCmd = (ev: ReactPointerEvent): { r: number; p: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    const r = Math.max(-1, Math.min(1, (ev.clientX - rect.left - C) / TRAVEL));
    const p = Math.max(-1, Math.min(1, (ev.clientY - rect.top - C) / TRAVEL));
    return { r, p };
  };

  return (
    <div>
      <svg
        ref={svgRef}
        className="stick-pad"
        width={PAD}
        height={PAD}
        role="application"
        aria-label="Virtual control stick"
        onPointerDown={(ev) => {
          dragging.current = true;
          svgRef.current?.setPointerCapture(ev.pointerId);
          const { r, p } = toCmd(ev);
          onStick(r, p);
        }}
        onPointerMove={(ev) => {
          if (!dragging.current) return;
          const { r, p } = toCmd(ev);
          onStick(r, p);
        }}
        onPointerUp={(ev) => {
          dragging.current = false;
          svgRef.current?.releasePointerCapture(ev.pointerId);
          onStick(0, 0);
        }}
      >
        <rect width={PAD} height={PAD} rx={10} fill="#0a0f16" stroke={AXIS} />
        <line x1={C} y1={10} x2={C} y2={PAD - 10} stroke={GRID} />
        <line x1={10} y1={C} x2={PAD - 10} y2={C} stroke={GRID} />
        <circle cx={C} cy={C} r={TRAVEL} fill="none" stroke={GRID} />
        <circle
          cx={C + roll * TRAVEL}
          cy={C + pitch * TRAVEL}
          r={9}
          fill={SERIES.blue}
          stroke={INK_2}
          strokeWidth={1.5}
        />
        <text x={C} y={PAD - 3} fill={MUTED} fontSize={9} textAnchor="middle">
          stick — drag (↓ = pull)
        </text>
      </svg>
      <div className="field" style={{ marginTop: '0.5rem' }}>
        <label>rudder</label>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={rudder}
          onChange={(e) => onRudder(Number(e.target.value))}
          onPointerUp={() => onRudder(0)}
          aria-label="Rudder"
        />
      </div>
    </div>
  );
};
