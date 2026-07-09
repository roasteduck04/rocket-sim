# Precision Instrument — design system

The web app's shared visual language (established in Phase 8, `finalproductroadmap.md`).
Dark-first, light-ready; calm, dense-capable, trustworthy. Every module (A–D + Overview)
renders on this system, and Phase 9+ features are built on it rather than restyled.

- **Base:** graphite surfaces, hairline dividers, depth from soft elevation.
- **Accent:** a single cyan-teal signature (`--fd-accent`). No per-module accents.
- **Type:** Inter (prose/UI) + JetBrains Mono (numerics/telemetry), bundled offline
  via `@fontsource-variable` (no CDN).
- **Motion:** quiet and fast (120–220 ms), `transform`/`opacity` only.

## Where it lives

```
apps/web/src/ui/
  tokens.ts     typed token source (JS/SVG/canvas/Recharts marks)
  tokens.css    :root custom properties mirroring tokens.ts (+ reserved light seam)
  base.css      reset, html/body, focus ring
  ui.css        component styles (fd-* classes)
  Panel/Stat/Chip/Button                     chrome primitives
  Field/NumberField/TextField/Select/Slider  form primitives
  Tabs/Toolbar/Tree/Modal                    editor primitives
  chartTheme.ts token-derived chart styling + categorical SERIES/STATUS
  index.ts      barrel — import primitives from '../ui'
apps/web/src/shell/
  nav.ts        data-driven NAV_GROUPS
  Sidebar/Header/AppShell + shell.css        the app frame
```

`tokens.ts` (typed) and `tokens.css` (CSS custom properties) are **hand-mirrored** — keep
them in sync when adding a token, the same paired convention the codebase already used for
`palette.ts ↔ styles.css`. CSS reads `var(--fd-*)`; only reach for the `tokens.ts` constants
where a raw hex string is required (chart series, SVG fills, canvas strokes).

## Tokens

Two tiers: **primitive** ramps (raw hex, `--fd-p-*`) → **semantic** aliases (`--fd-*`).
Only semantic names appear at call sites.

| Group | Tokens |
| --- | --- |
| Surface | `--fd-bg`, `--fd-surface`, `--fd-surface-2`, `--fd-elevated` |
| Ink | `--fd-ink`, `--fd-ink-2`, `--fd-muted` |
| Line | `--fd-border`, `--fd-border-strong`, `--fd-hairline` |
| Accent | `--fd-accent`, `--fd-accent-strong`, `--fd-accent-dim`, `--fd-accent-border`, `--fd-accent-ink` |
| Series | `--fd-series-1 … --fd-series-6` (fixed order, per-entity, never cycled) |
| Status | `--fd-good`, `--fd-warning`, `--fd-serious`, `--fd-critical` |
| Chart | `--fd-grid`, `--fd-axis` (recessive; text never wears these) |
| Type | `--fd-font-sans`, `--fd-font-mono`, `--fd-text-2xs … 3xl`, weights, leadings, tracking |
| Space | `--fd-space-1 … 7` (4 / 8 / 12 / 16 / 24 / 32 / 48) |
| Radii | `--fd-radius-sm/md/lg/pill` |
| Elevation | `--fd-elev-1/2/3` |
| Motion | `--fd-dur-fast/base/slow`, `--fd-ease-standard/emphasized` |
| Z-index | `--fd-z-base/sticky/overlay/modal/toast` |

**Light theme (Phase 13):** a reserved `:root[data-theme="light"]` block in `tokens.css`
documents the seam. Only the semantic aliases are re-pointed there; primitives and the
type/space/radii/motion groups are theme-invariant. No light values are authored yet.

## Component inventory

Import from the barrel: `import { Panel, NumberField, Button } from '../ui'`.

### Chrome
- **`Panel`** — titled surface with an optional `action` slot. `<Panel title="…" action={…}>`.
- **`Stat`** — `label` / `value` / `unit` readout; value is mono + tabular.
- **`Chip`** — pill with `tone`: `neutral | accent | good | warning | serious | critical`.
- **`Button`** — `variant` (`primary | secondary | danger`), `size` (`sm | md`), `busy`
  (disables + `aria-busy`). `type` defaults to `button`.

### Form
- **`Field`** — the shared label/control/hint/error skeleton (`for` + `aria-describedby`).
  The other form controls render through it; use it directly to wrap a custom control.
- **`NumberField`** — the studio workhorse. SI `unit` suffix, **drag-to-scrub** on the label,
  clamp to `[min, max]`, snap to `step`, keyboard ↑/↓ (×10 with Shift), commit on blur/Enter.
- **`TextField`** / **`Select`** / **`Slider`** — native-backed for free keyboard + a11y.

### Editor
- **`Tabs`** — ARIA tablist with roving focus (←/→/Home/End); renders the active panel.
- **`Toolbar`** — `role="toolbar"` action row; `Toolbar.Separator`, `Toolbar.Spacer`.
- **`Tree`** — single-select ARIA tree (expand/collapse, arrow-key nav, selection-follows-
  focus). The component-tree editor primitive for the Phase 9 studio.
- **`Modal`** — portalled dialog: focus-trap, Esc to close, focus restore.

All primitives are typed, accessible (labels, roles, keyboard, visible focus ring), and
unit-tested (`apps/web/tests/ui-chrome.test.tsx`, `ui-forms.test.tsx`). Each is props-in →
accessible-markup-out with no simulation logic inside.

## Charts

`ui/chartTheme.ts` derives axis/grid/tooltip/legend styling from tokens; `lib/charts.tsx`
(`TimeChart`) and the bespoke SVG charts consume it so every chart reads as one system.
Rules: one y-scale per chart (never dual-axis), thin 2 px lines, recessive grid, crosshair
tooltip, legend only for ≥ 2 series. Series colors come from `SERIES` (fixed order, assigned
per entity, never cycled); status colors are reserved for limits/verdicts.

## Navigation

`shell/AppShell` = grouped `Sidebar` + slim `Header` + a `<main>` outlet, preserving the
one-view-mounted router (unmounting a view stops its rAF loop + workers). Destinations are
data-driven in `shell/nav.ts` — a later phase adds a nav entry + a view, no shell changes.

## Do / don't

- **Do** use semantic tokens (`var(--fd-surface)`), never raw hex, at call sites.
- **Do** put every telemetry number in the mono family with tabular figures (`.fd-num` or a
  primitive that already does).
- **Do** animate only `transform`/`opacity`, within the motion-duration tokens.
- **Don't** introduce a new accent — the cyan-teal is the whole brand. Status colors are for
  limits/verdicts, never decoration or a data series.
- **Don't** cycle series colors; assign a fixed slot per entity so it stays stable across charts.
- **Don't** hard-code fonts — reference `--fd-font-sans`/`--fd-font-mono` (CSS) or `FONT` (JS).
- **Don't** add a stylesheet with literal colors; extend `tokens.ts` + `tokens.css` together.
