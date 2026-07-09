/**
 * Precision Instrument — design tokens (typed source).
 *
 * The authoritative values consumed by JS marks (SVG / canvas / Recharts),
 * hand-mirrored by `ui/tokens.css` for CSS. Keep the two in sync — the same
 * paired convention the legacy `palette.ts ↔ styles.css` used. CSS should read
 * the `--fd-*` custom properties; only reach for these constants where a raw
 * hex string is required (chart series, SVG fills, canvas strokes).
 *
 * Two tiers: PRIMITIVE ramps (raw hex) → SEMANTIC aliases (role-named). Only
 * the semantic groups (COLOR / SERIES / STATUS / CHART / FONT) are meant for use.
 */

/* ---- Primitive ramps (raw hex) ------------------------------------------- */

export const PRIMITIVE = {
  graphite: {
    950: '#0a0d11',
    900: '#0e1216',
    850: '#12171d',
    800: '#171d24',
    750: '#1d242d',
    700: '#232b35',
    600: '#2e3742',
    500: '#3b4551',
  },
  slate: {
    50: '#eef1f5',
    200: '#cbd2db',
    400: '#97a1af',
    500: '#6c7684',
    600: '#545d6a',
  },
  teal: {
    300: '#63e6dd',
    400: '#33d6cb',
    500: '#1fb3a9',
    700: '#146b66',
  },
} as const;

/* ---- Semantic color aliases ---------------------------------------------- */

export const COLOR = {
  bg: PRIMITIVE.graphite[950],
  surface: PRIMITIVE.graphite[900],
  surface2: PRIMITIVE.graphite[850],
  elevated: PRIMITIVE.graphite[800],

  ink: PRIMITIVE.slate[50],
  ink2: PRIMITIVE.slate[400],
  muted: PRIMITIVE.slate[500],

  border: PRIMITIVE.graphite[600],
  borderStrong: PRIMITIVE.graphite[500],
  hairline: 'rgba(230, 238, 247, 0.07)',

  accent: PRIMITIVE.teal[400],
  accentStrong: PRIMITIVE.teal[300],
  accentMuted: PRIMITIVE.teal[500],
  accentDim: 'rgba(51, 214, 203, 0.13)',
  accentBorder: 'rgba(51, 214, 203, 0.35)',
  accentInk: '#06110f',
} as const;

/**
 * Categorical series — fixed order. Assigned per entity and never cycled, so
 * a given entity keeps its color across every chart (dataviz convention).
 */
export const SERIES = {
  1: '#5b9bff', // blue
  2: '#52d99e', // green
  3: '#ffb454', // orange
  4: '#c07cff', // violet
  5: '#ff738a', // pink
  6: '#cbd94a', // lime
} as const;

/** Ordered list of the series colors (slot 1 → 6). */
export const SERIES_ORDER = [
  SERIES[1],
  SERIES[2],
  SERIES[3],
  SERIES[4],
  SERIES[5],
  SERIES[6],
] as const;

/** Status — reserved for limit lines, verdict chips, and markers. */
export const STATUS = {
  good: '#35c65a',
  warning: '#f5b73c',
  serious: '#f0894e',
  critical: '#ec5a5a',
} as const;

/** Chart furniture (recessive; text never wears these). */
export const CHART = {
  grid: 'rgba(230, 238, 247, 0.06)',
  axis: 'rgba(230, 238, 247, 0.16)',
} as const;

/* ---- Typography ---------------------------------------------------------- */

export const FONT = {
  sans: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
} as const;

/**
 * Resolve a semantic token to its `var(--fd-*)` reference for inline styles
 * (prefer plain CSS classes; use this only where a style object is unavoidable).
 */
export const cssVar = (name: string): string => `var(--fd-${name})`;
