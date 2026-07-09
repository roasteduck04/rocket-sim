/**
 * Precision Instrument UI kit — barrel export (Phase 8).
 *
 * Import primitives from `@/ui` (or a relative `../ui`) rather than reaching
 * into individual files. Token constants live in `./tokens`; the matching CSS
 * (`tokens.css`, `base.css`, `ui.css`) is loaded once in `main.tsx`.
 */

export { Panel } from './Panel';
export type { PanelProps } from './Panel';

export { Stat } from './Stat';
export type { StatProps } from './Stat';

export { Chip } from './Chip';
export type { ChipProps, ChipTone } from './Chip';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export * as tokens from './tokens';
