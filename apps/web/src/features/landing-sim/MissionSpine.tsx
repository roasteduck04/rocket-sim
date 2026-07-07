/**
 * Mission spine (D · Landing signature): a hero T-minus countdown clock above a
 * four-node phase ladder — FREEFALL → ENTRY BURN → LANDING BURN → TOUCHDOWN.
 * The descent reads as a live mission timeline: the current phase is lit amber,
 * past phases dim, future phases muted. Purely a function of the current
 * playback sample + the run's phase timestamps, so replays are identical.
 */

import { type JSX } from 'react';
import { phaseAt } from './Dashboard';
import type { PhaseLabel, PhaseTimes } from './types';

/** Seconds → MM:SS.d, tabular and zero-padded (clamped at zero). */
const clock = (s: number): string => {
  const c = Math.max(0, s);
  const m = Math.floor(c / 60);
  const sec = c - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
};

/** The fixed mission profile, in order; ignition() is the phase's start time. */
const PHASES: ReadonlyArray<{
  label: PhaseLabel;
  ignition(times: PhaseTimes, duration: number): number | null;
}> = [
  { label: 'FREEFALL', ignition: () => 0 },
  { label: 'ENTRY BURN', ignition: (t) => t.entryBurnIgnitionTime },
  { label: 'LANDING BURN', ignition: (t) => t.landingIgnitionTime },
  { label: 'TOUCHDOWN', ignition: (_t, duration) => duration },
];

export const MissionSpine = ({
  t,
  times,
  duration,
}: {
  /** Current playback time, s. */
  t: number;
  times: PhaseTimes;
  duration: number;
}): JSX.Element => {
  const active = phaseAt(t, times, duration);
  const activeIdx = PHASES.findIndex((p) => p.label === active);
  const done = t >= duration;
  const remaining = duration - t;

  return (
    <div className="lc lc-spine">
      <p className="lc-clock-label">{done ? 'Touchdown' : 'T-minus'}</p>
      <p className={`lc-clock${done ? ' is-done' : ''}`}>T−{clock(done ? 0 : remaining)}</p>

      <ol className="lc-ladder" aria-label="Mission phase">
        {PHASES.map((p, i) => {
          const state = i < activeIdx ? 'is-past' : i === activeIdx ? 'is-active' : 'is-future';
          const start = p.ignition(times, duration);
          // Ignition marker: T-minus at which this phase begins (burns only).
          const marker =
            p.label === 'ENTRY BURN' || p.label === 'LANDING BURN'
              ? start === null
                ? '—'
                : `T−${clock(duration - start)}`
              : '';
          return (
            <li key={p.label} className={`lc-ladder-item ${state}`} aria-current={i === activeIdx}>
              <span className="lc-node" />
              {p.label}
              {marker && <span className="lc-tminus">{marker}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
