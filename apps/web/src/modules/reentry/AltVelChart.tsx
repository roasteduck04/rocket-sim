/**
 * Altitude-vs-velocity trajectory plot (README §9 Module B) — the classic
 * reentry state-space view; the trace runs right-to-left as the vehicle
 * decelerates.
 */

import { useMemo, type JSX } from 'react';
import type { ReentryFrame } from '@fds/reentry-sim';
import { TimeChart, type ChartRow } from '../../lib/charts';
import { SERIES } from '../../ui/chartTheme';

const MAX_ROWS = 600;

export const AltVelChart = ({ history }: { history: ReentryFrame[] }): JSX.Element => {
  const rows = useMemo(() => {
    const stride = Math.max(1, Math.ceil(history.length / MAX_ROWS));
    const out: ChartRow[] = [];
    for (let i = 0; i < history.length; i += stride) {
      const f = history[i];
      out.push({ v: f.V, altKm: f.h / 1000 });
    }
    return out;
  }, [history]);

  return (
    <TimeChart
      title="Altitude vs velocity"
      unit="km"
      data={rows}
      series={[{ key: 'altKm', label: 'altitude', color: SERIES.blue }]}
      xKey="v"
      xLabel="V (m/s)"
    />
  );
};
