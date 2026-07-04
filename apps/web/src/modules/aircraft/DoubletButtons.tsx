/**
 * First-class mode-excitation buttons (README §6.4 — "the single most
 * pedagogically valuable feature of this module"). Each button injects a
 * canned doublet on the channel that excites the mode in near-isolation:
 * a brief elevator doublet for the short period, a long slow one for the
 * phugoid, a rudder doublet for the dutch roll, an aileron pulse for the
 * roll/spiral pair.
 */

import type { JSX } from 'react';
import { degToRad } from '../../lib/unitsDisplay';

export type DoubletChannel = 'elevator' | 'aileron' | 'rudder';

export interface DoubletSpec {
  channel: DoubletChannel;
  /** Half-pulse width, s (doublet = +amp then −amp, each `width` long). */
  width: number;
  /** Amplitude, rad of surface deflection. */
  amplitude: number;
}

const DOUBLETS: ReadonlyArray<{ label: string; hint: string; spec: DoubletSpec }> = [
  {
    label: 'Short period',
    hint: 'brief elevator doublet — fast, well-damped pitch transient',
    spec: { channel: 'elevator', width: 0.5, amplitude: degToRad(4) },
  },
  {
    label: 'Phugoid',
    hint: 'slow elevator doublet — long lightly-damped speed/height exchange',
    spec: { channel: 'elevator', width: 5, amplitude: degToRad(2) },
  },
  {
    label: 'Dutch roll',
    hint: 'rudder doublet — coupled yaw/roll oscillation',
    spec: { channel: 'rudder', width: 0.8, amplitude: degToRad(8) },
  },
  {
    label: 'Roll / spiral',
    hint: 'aileron pulse — fast roll subsidence, then the slow spiral',
    spec: { channel: 'aileron', width: 0.6, amplitude: degToRad(10) },
  },
];

export const DoubletButtons = ({
  onFire,
}: {
  onFire: (spec: DoubletSpec) => void;
}): JSX.Element => (
  <div className="panel">
    <h2>Mode excitation</h2>
    {DOUBLETS.map((d) => (
      <div key={d.label} style={{ marginBottom: '0.55rem' }}>
        <button type="button" className="btn secondary" onClick={() => onFire(d.spec)}>
          {d.label}
        </button>
        <p className="hint" style={{ marginTop: '0.15rem' }}>
          {d.hint}
        </p>
      </div>
    ))}
  </div>
);
