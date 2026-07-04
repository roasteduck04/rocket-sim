/**
 * Chart color tokens — the dataviz reference palette's DARK column (the app is
 * a single-mode dark cockpit). Values mirror the CSS custom properties in
 * styles.css so SVG/Recharts marks and CSS chrome stay in sync.
 *
 * Rules applied throughout the charts (dataviz skill):
 *  - categorical slots in fixed order, assigned per entity, never cycled;
 *  - status colors are reserved for limits/verdicts, never for a series;
 *  - text wears ink tokens, never a series color.
 */

export const SURFACE = '#1a1a19';
export const PAGE = '#0d0d0d';
export const INK = '#ffffff';
export const INK_2 = '#c3c2b7';
export const MUTED = '#898781';
export const GRID = '#2c2c2a';
export const AXIS = '#383835';

/** Categorical slots (dark-surface steps), fixed order. */
export const SERIES = {
  blue: '#3987e5',
  aqua: '#199e70',
  yellow: '#c98500',
  green: '#008300',
  violet: '#9085e9',
  red: '#e66767',
} as const;

/** Status colors — reserved for limit lines, verdict chips, and markers. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;
