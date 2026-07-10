/**
 * Navigation model (Phase 8 Stage 5). Data-driven so later phases add a
 * destination by adding an entry here (+ a view) — no shell changes. Active
 * destinations carry a `view` id the router mounts; Phase 9+ destinations are
 * `disabled` placeholders until their phase lands.
 */

/** The views the router can mount today. */
export type ViewId = 'overview' | 'rocket' | 'reentry' | 'aircraft' | 'landing' | 'design-studio';

export interface NavItem {
  /** Stable key; equals the `ViewId` for active destinations. */
  id: string;
  label: string;
  /** Present for live destinations; absent for "coming soon" placeholders. */
  view?: ViewId;
  disabled?: boolean;
  /** Short parenthetical shown on disabled items (e.g. "Phase 9"). */
  soon?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    title: 'Simulators',
    items: [
      { id: 'overview', label: 'Overview', view: 'overview' },
      { id: 'rocket', label: 'A · Rocket', view: 'rocket' },
      { id: 'reentry', label: 'B · Reentry', view: 'reentry' },
      { id: 'aircraft', label: 'C · Aircraft', view: 'aircraft' },
      { id: 'landing', label: 'D · Landing', view: 'landing' },
    ],
  },
  {
    title: 'Studio',
    items: [
      { id: 'design-studio', label: 'Rocket Design Studio', view: 'design-studio' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { id: 'monte-carlo', label: 'Monte Carlo', disabled: true, soon: 'Phase 10' },
      { id: 'optimization', label: 'Optimization', disabled: true, soon: 'Phase 12' },
    ],
  },
  {
    title: 'Learn',
    items: [{ id: 'learn', label: 'Guided lessons', disabled: true, soon: 'Phase 13' }],
  },
];
