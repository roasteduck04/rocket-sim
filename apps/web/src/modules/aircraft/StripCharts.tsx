/**
 * Scrolling strip charts for α, β, p, q, r, φ, θ (README §9 Module C),
 * grouped by unit so every chart keeps a single y-scale: incidence angles,
 * body rates, attitude. Memoized — the parent re-renders at display rate,
 * but chart data only updates at the decimated sample rate.
 */

import { memo, type JSX } from 'react';
import { TimeChart, type ChartRow } from '../../lib/charts';
import { SERIES } from '../../lib/palette';

export interface StripSample extends ChartRow {
  t: number;
  alphaDeg: number;
  betaDeg: number;
  pDeg: number;
  qDeg: number;
  rDeg: number;
  phiDeg: number;
  thetaDeg: number;
}

export const StripCharts = memo(function StripCharts({
  data,
}: {
  data: StripSample[];
}): JSX.Element {
  return (
    <div className="chart-grid">
      <TimeChart
        title="Incidence (Δ from trim)"
        unit="deg"
        data={data}
        series={[
          { key: 'alphaDeg', label: 'α', color: SERIES.blue },
          { key: 'betaDeg', label: 'β', color: SERIES.aqua },
        ]}
        height={170}
      />
      <TimeChart
        title="Body rates"
        unit="deg/s"
        data={data}
        series={[
          { key: 'pDeg', label: 'p', color: SERIES.blue },
          { key: 'qDeg', label: 'q', color: SERIES.aqua },
          { key: 'rDeg', label: 'r', color: SERIES.yellow },
        ]}
        height={170}
      />
      <TimeChart
        title="Attitude (Δ from trim)"
        unit="deg"
        data={data}
        series={[
          { key: 'phiDeg', label: 'φ', color: SERIES.blue },
          { key: 'thetaDeg', label: 'θ', color: SERIES.aqua },
        ]}
        height={170}
      />
    </div>
  );
});
