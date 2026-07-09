/**
 * Shared Recharts wrapper for the telemetry/time-history charts. One y-scale
 * per chart (never dual-axis — two measures of different scale get two charts);
 * thin 2px lines, recessive grid, crosshair tooltip by default; a legend
 * appears only for ≥2 series (a single series is named by the title).
 */

import type { JSX } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartTheme } from '../ui/chartTheme';

export interface SeriesSpec {
  /** Row property to plot. */
  key: string;
  label: string;
  color: string;
}

/** Dashed annotation line (max-Q marker, structural limit, ...). */
export interface RefLineSpec {
  x?: number;
  y?: number;
  label: string;
  color: string;
}

export type ChartRow = Record<string, number>;

const TOOLTIP_STYLE = chartTheme.tooltip;

export const TimeChart = ({
  title,
  unit,
  data,
  series,
  xKey = 't',
  xLabel = 't (s)',
  refLines = [],
  height = 180,
  yDomain,
}: {
  title: string;
  /** Display unit for the y values (SI converted at the boundary). */
  unit?: string;
  data: ChartRow[];
  series: SeriesSpec[];
  xKey?: string;
  xLabel?: string;
  refLines?: RefLineSpec[];
  height?: number;
  yDomain?: [number | 'auto', number | 'auto'];
}): JSX.Element => (
  <div className="chart-card panel">
    <h3>
      {title}
      {unit ? <span style={{ color: chartTheme.muted }}> · {unit}</span> : null}
    </h3>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 14, bottom: 2, left: 0 }}>
        <CartesianGrid stroke={chartTheme.grid} vertical={false} />
        <XAxis
          dataKey={xKey}
          type="number"
          domain={['dataMin', 'dataMax']}
          stroke={chartTheme.axis}
          tickLine={false}
          tick={{ fill: chartTheme.muted, fontSize: 11 }}
          label={{ value: xLabel, position: 'insideBottomRight', fill: chartTheme.muted, fontSize: 11, dy: 8 }}
          height={30}
        />
        <YAxis
          stroke={chartTheme.axis}
          tickLine={false}
          tick={{ fill: chartTheme.muted, fontSize: 11 }}
          width={54}
          domain={yDomain ?? ['auto', 'auto']}
          tickFormatter={(v: number) => `${Number(v.toPrecision(4))}`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(x) => `${xLabel.split(' ')[0]} = ${Number(x).toFixed(2)}`}
          formatter={(v) => (typeof v === 'number' ? v.toPrecision(4) : String(v))}
          isAnimationActive={false}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, color: chartTheme.ink2 }} iconType="plainline" />
        )}
        {refLines.map((rl) => (
          <ReferenceLine
            key={rl.label}
            x={rl.x}
            y={rl.y}
            stroke={rl.color}
            strokeDasharray="4 3"
            ifOverflow="extendDomain"
            label={{
              value: rl.label,
              fill: rl.color,
              fontSize: 10,
              position: rl.y !== undefined ? 'insideTopRight' : 'insideTopLeft',
            }}
          />
        ))}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            type="linear"
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  </div>
);
