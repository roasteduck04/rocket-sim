/**
 * Heat-flux and g-load time histories with the §8.2 limit lines drawn in
 * (README §9 Module B). Two separate charts — the two quantities have
 * different scales, so they never share an axis.
 */

import { useMemo, type JSX } from 'react';
import type { ReentryFrame, ReentryLimits } from '@fds/reentry-sim';
import { TimeChart, type ChartRow } from '../../lib/charts';
import { SERIES, STATUS } from '../../ui/chartTheme';

const MAX_ROWS = 600;

const toRows = (history: ReentryFrame[]): ChartRow[] => {
  const stride = Math.max(1, Math.ceil(history.length / MAX_ROWS));
  const rows: ChartRow[] = [];
  for (let i = 0; i < history.length; i += stride) {
    const f = history[i];
    rows.push({ t: f.t, qMW: f.qdotS / 1e6, n: f.nLoad });
  }
  return rows;
};

export const HeatGLoadCharts = ({
  history,
  limits,
}: {
  history: ReentryFrame[];
  limits: ReentryLimits;
}): JSX.Element => {
  const rows = useMemo(() => toRows(history), [history]);
  return (
    <>
      <TimeChart
        title="Stagnation heat flux q̇ₛ"
        unit="MW/m²"
        data={rows}
        series={[{ key: 'qMW', label: 'q̇ₛ', color: SERIES.blue }]}
        refLines={[
          {
            y: limits.maxHeatFluxWm2 / 1e6,
            label: `limit ${(limits.maxHeatFluxWm2 / 1e6).toFixed(1)} MW/m²`,
            color: STATUS.critical,
          },
        ]}
      />
      <TimeChart
        title="Load factor n"
        unit="g"
        data={rows}
        series={[{ key: 'n', label: 'n', color: SERIES.blue }]}
        refLines={[
          { y: limits.maxGLoad, label: `limit ${limits.maxGLoad} g`, color: STATUS.critical },
        ]}
      />
    </>
  );
};
