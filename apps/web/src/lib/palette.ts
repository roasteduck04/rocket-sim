/**
 * Legacy color shim (Phase 8). Every value now derives from `ui/tokens.ts` —
 * this file only preserves the old export names so the remaining SVG/canvas/3D
 * widgets keep compiling. The bespoke dark-cockpit, ignition-amber, and
 * blueprint palettes are retired: Module D's amber and the Overview blueprint
 * both converge onto the shared cyan-teal accent + graphite surfaces.
 *
 * New code should import from `ui/tokens.ts` (typed) or `ui/chartTheme.ts`
 * directly; this shim is expected to disappear as the widgets migrate.
 */

import { COLOR, CHART } from '../ui/tokens';

// Categorical (fixed order, per-entity) + status — owned by the token layer.
export { SERIES, STATUS } from '../ui/chartTheme';

// Neutral chrome — now token-derived (graphite + slate).
export const SURFACE = COLOR.surface;
export const PAGE = COLOR.bg;
export const INK = COLOR.ink;
export const INK_2 = COLOR.ink2;
export const MUTED = COLOR.muted;
// Grid/axis for the SVG/3D instrument widgets: visible graphite lines (the
// recessive chart-grid rgba lives in ui/chartTheme.ts / CHART instead).
export const GRID = COLOR.border;
export const AXIS = COLOR.borderStrong;

/** Recessive chart gridlines (re-exported for parity with the token layer). */
export const CHART_GRID = CHART.grid;

/**
 * D · Landing console identity — converged onto the unified tokens. The former
 * ignition-amber accent is now the shared cyan-teal; `ground`/`sky` remain
 * literal because they are scene content (the canvas world), not chrome.
 */
export const LANDING = {
  void: COLOR.bg,
  panel: COLOR.surface,
  panel2: COLOR.surface2,
  ink: COLOR.ink,
  ink2: COLOR.ink2,
  muted: COLOR.muted,
  amber: COLOR.accent,
  /** Deep slate for the ground plane in the canvas (scene content). */
  ground: '#12151c',
  /** Day-blue sky at the deck, blending to the void at altitude (scene). */
  sky: '#6f9fce',
} as const;

/** Suite Overview front door — converged onto the unified tokens. */
export const OVERVIEW = {
  void: COLOR.bg,
  panel: COLOR.surface,
  line: COLOR.hairline,
  line2: COLOR.border,
  ink: COLOR.ink,
  ink2: COLOR.ink2,
  muted: COLOR.muted,
} as const;
