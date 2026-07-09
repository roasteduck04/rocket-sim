/**
 * Legacy color shim (Phase 8 Stage 4). The categorical + status colors are now
 * owned by `ui/tokens.ts` and re-exported here via `ui/chartTheme.ts`, so there
 * is a single source. The neutral chrome constants below stay as literals for
 * the not-yet-migrated SVG/3D widgets (attitude indicator, stick, trajectory
 * scene, envelope map); Stage 6/7 re-points those onto `ui/tokens.ts` and
 * removes this file. `LANDING`/`OVERVIEW` are Module D + Overview identities,
 * retired when those views converge in Stage 7.
 */

// Categorical (fixed order, per-entity) + status — folded into the token layer.
export { SERIES, STATUS } from '../ui/chartTheme';

// Neutral chrome — original dark-cockpit hexes, retained for the SVG/3D widgets
// that still import from here until their Stage 6/7 refit.
export const SURFACE = '#1a1a19';
export const PAGE = '#0d0d0d';
export const INK = '#ffffff';
export const INK_2 = '#c3c2b7';
export const MUTED = '#898781';
export const GRID = '#2c2c2a';
export const AXIS = '#383835';

/**
 * D · Landing console identity (mirrors the `--l-*` custom properties in
 * styles.css). Retired in Stage 7 when Module D converges onto the unified
 * tokens.
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
 * styles.css). Retired in Stage 7 when the Overview converges.
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
