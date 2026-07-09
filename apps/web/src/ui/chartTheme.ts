/**
 * Chart theme (Phase 8 Stage 4) — the single token-derived style source every
 * chart consumes, so Recharts time-histories and the bespoke SVG charts
 * (corridor, ground-track, alt/vel, strip, heat/g-load) read as one system.
 *
 * Derived from `ui/tokens.ts`. Charts import neutrals + tooltip/legend/axis
 * styling from here, and their series colors from `SERIES` (fixed order,
 * assigned per entity, never cycled). `lib/palette.ts` now re-exports `SERIES`
 * and `STATUS` from this module, so there is one categorical source.
 */

import { COLOR, CHART, SERIES as SLOT, SERIES_ORDER, STATUS as STATUS_TOKENS } from './tokens';

/** Structured styling for Recharts axes/grid/tooltip/legend + custom SVG. */
export const chartTheme = {
  surface: COLOR.surface,
  grid: CHART.grid,
  axis: CHART.axis,
  ink: COLOR.ink,
  ink2: COLOR.ink2,
  muted: COLOR.muted,
  tick: { fill: COLOR.muted, fontSize: 11 },
  tooltip: {
    background: COLOR.elevated,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 8,
    color: COLOR.ink2,
    fontSize: 12,
  },
  legend: { fontSize: 11, color: COLOR.ink2 },
} as const;

/**
 * Categorical series — the legacy named handles, mapped onto the Precision
 * Instrument slots. Fixed order; a given entity keeps its color across charts.
 * (blue→1, aqua→2/green, yellow→3/orange, green→6/lime, violet→4, red→5/pink.)
 */
export const SERIES = {
  blue: SLOT[1],
  aqua: SLOT[2],
  yellow: SLOT[3],
  green: SLOT[6],
  violet: SLOT[4],
  red: SLOT[5],
} as const;

export const STATUS = STATUS_TOKENS;
export { SERIES_ORDER };

/* Loose neutral constants for the custom-SVG charts (drop-in for the old
   palette imports). */
export const AXIS = CHART.axis;
export const GRID = CHART.grid;
export const INK = COLOR.ink;
export const INK_2 = COLOR.ink2;
export const MUTED = COLOR.muted;
export const SURFACE = COLOR.surface;
