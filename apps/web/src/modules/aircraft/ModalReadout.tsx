/**
 * Live modal-analysis readout (README §6.5, §9): mode name, ω_n, ζ,
 * t_half / t_double, and period for every longitudinal and lateral mode,
 * recomputed from the current A-matrices whenever the aircraft or trim
 * condition changes.
 */

import { memo, useMemo, type JSX } from 'react';
import {
  buildLatStateSpace,
  buildLonStateSpace,
  modalAnalysis,
  type AircraftConfig,
  type ModeReport,
} from '@fds/aircraft-sim';
import { fmt } from '../../lib/unitsDisplay';

const MODE_LABEL: Record<string, string> = {
  'short-period': 'Short period',
  phugoid: 'Phugoid',
  roll: 'Roll subsidence',
  spiral: 'Spiral',
  'dutch-roll': 'Dutch roll',
  unknown: '(unclassified)',
};

const Row = ({ m }: { m: ModeReport }): JSX.Element => (
  <tr>
    <td>{MODE_LABEL[m.name] ?? m.name}</td>
    <td>{m.oscillatory ? fmt(m.wn, 3) : `1/τ=${fmt(m.wn, 3)}`}</td>
    <td>{m.oscillatory ? fmt(m.zeta, 3) : '—'}</td>
    <td>
      {Number.isFinite(m.tHalfOrDouble) ? fmt(m.tHalfOrDouble, 1) : '∞'}
      {m.isDoubling ? ' ×2' : ''}
    </td>
    <td>{Number.isFinite(m.period) ? fmt(m.period, 1) : '—'}</td>
  </tr>
);

export const ModalReadout = memo(function ModalReadout({
  cfg,
}: {
  cfg: AircraftConfig;
}): JSX.Element {
  const { lon, lat } = useMemo(
    () => ({
      lon: modalAnalysis(buildLonStateSpace(cfg).A),
      lat: modalAnalysis(buildLatStateSpace(cfg).A),
    }),
    [cfg],
  );
  return (
    <div className="panel">
      <h2>Dynamic modes — live</h2>
      <table className="modal-table">
        <thead>
          <tr>
            <th>mode</th>
            <th>ωₙ (rad/s)</th>
            <th>ζ</th>
            <th>t½ (s)</th>
            <th>T (s)</th>
          </tr>
        </thead>
        <tbody>
          {lon.map((m, i) => (
            <Row key={`lon${i}`} m={m} />
          ))}
          {lat.map((m, i) => (
            <Row key={`lat${i}`} m={m} />
          ))}
        </tbody>
      </table>
      <p className="hint">t½ ×2 marks a doubling time (unstable mode).</p>
    </div>
  );
});
