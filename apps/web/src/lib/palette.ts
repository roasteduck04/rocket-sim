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

/**
 * D · Landing console identity (mirrors the `--l-*` custom properties in
 * styles.css). A cooler, darker instrument base than the shared cockpit chrome,
 * with a warm ignition-amber accent that ties the UI to the burn. Imported by
 * the landing-sim SVG/canvas so JS marks and CSS stay in sync. The green/amber/
 * red outcome triad above (STATUS) stays purely semantic — `amber` here is a
 * chrome accent, never a caution signal.
 */
export const LANDING = {
  void: '#07080b',
  panel: '#0f1117',
  panel2: '#141821',
  ink: '#e8ecf2',
  ink2: '#9aa4b2',
  muted: '#5f6875',
  amber: '#f5b52e',
  /** Deep slate for the ground plane in the canvas. */
  ground: '#12151c',
  /** Day-blue sky at the deck (blends to `void` at altitude). */
  sky: '#6f9fce',
} as const;

/**
 * Suite Overview front door (mirrors the `--ov-*` custom properties in
 * styles.css). A deep instrument void with a hairline blueprint grid; the four
 * module accents (imported from SERIES/STATUS/LANDING above) are the only
 * saturated marks on the flight-envelope plot, each coding one regime. Imported
 * by EnvelopeMap.tsx so the SVG base/grid/ink match the CSS chrome exactly.
 */
export const OVERVIEW = {
  void: '#06070a',
  panel: '#0d0f15',
  line: 'rgba(150, 180, 210, 0.10)',
  line2: 'rgba(150, 180, 210, 0.20)',
  ink: '#e9edf3',
  ink2: '#97a1b0',
  muted: '#59616e',
} as const;
