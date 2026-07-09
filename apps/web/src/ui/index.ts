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

export { Field, describedBy } from './Field';
export type { FieldProps } from './Field';

export { NumberField } from './NumberField';
export type { NumberFieldProps } from './NumberField';

export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { Toolbar } from './Toolbar';
export type { ToolbarProps } from './Toolbar';

export { Tree } from './Tree';
export type { TreeProps, TreeNode } from './Tree';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export * as tokens from './tokens';
