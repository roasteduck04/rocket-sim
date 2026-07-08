# Phase 8 — Design Language & IA (Implementation Plan)

**Spec:** `docs/superpowers/specs/2026-07-08-phase-8-design-language-design.md`
**Roadmap:** `finalproductroadmap.md` (Phase 8)

Fresh "Precision Instrument" design system for `apps/web`: typed tokens, a shared React UI kit
(chrome + studio form primitives), a token-fed chart theme, and a left-sidebar nav shell — with
all existing A–D + Overview views refit onto it. **No `packages/*` edits; no feature/physics
changes.** Each stage ends green (`test:web` + `build:web`) and is committed on its own so
compaction / `continue` never loses state. Commits: authored **roasteduck04**, no co-author
trailers (per `CLAUDE.md`).

## Target layout

```
apps/web/src/ui/
  tokens.ts  tokens.css  base.css  ui.css  index.ts
  Panel.tsx  Stat.tsx  Chip.tsx  Button.tsx
  Field.tsx  NumberField.tsx  Select.tsx  Slider.tsx  TextField.tsx
  Tree.tsx  Tabs.tsx  Toolbar.tsx  Modal.tsx
  chartTheme.ts
apps/web/src/shell/
  AppShell.tsx  Sidebar.tsx  Header.tsx  nav.ts
```

## Stages

### Stage 0 — Spec + progress tracking ✅ (this commit)
- Spec → `docs/superpowers/specs/2026-07-08-phase-8-design-language-design.md`.
- This plan → `docs/superpowers/plans/2026-07-08-phase-8-design-language.md`.
- `finalproductroadmap.md`: add a **Status** column + Phase 8 stage checklist + Progress log; mark
  Phase 8 in progress. Commit the (previously untracked) roadmap.
- `.gitignore`: ignore `OpenRocket/` (local-only 583 MB reference).
- `CLAUDE.md`: one-line pointer to where phase status lives.

### Stage 1 — Fonts + tokens
- Add deps `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`; in `main.tsx`
  replace the Saira/Space Mono imports with the Inter/JetBrains imports and import
  `ui/tokens.css` + `ui/base.css`.
- Create `ui/tokens.ts` (typed) and `ui/tokens.css` (mirrored `:root`, reserved
  `[data-theme="light"]`). Extract reset/html/body/focus into `ui/base.css` from `styles.css`.
- **Green:** `build:web` passes; app still renders (old classes still resolve via remaining
  `styles.css`). Commit.

### Stage 2 — Chrome primitives
- `Panel`, `Stat`, `Chip`, `Button` + their `ui.css` sections, token-driven.
- RTL tests: renders, variants/status classes, `disabled`/`busy` on `Button`.
- **Green:** `test:web` + `build:web`. Commit.

### Stage 3 — Form/editor primitives
- `Field`, `NumberField` (unit suffix, drag-to-scrub, clamp/step, keyboard ↑/↓), `Select`,
  `Slider`, `TextField`, `Tree`, `Tabs`, `Toolbar`, `Modal` (focus-trap + Esc).
- RTL tests: NumberField scrub/clamp/keyboard, Select keyboard nav, Modal focus-trap + Esc, Tabs
  switching, Tree expand/select.
- **Green:** `test:web` + `build:web`. Commit.

### Stage 4 — Chart theme
- `ui/chartTheme.ts`: tokens → axis/grid/tooltip/legend props. Refactor `lib/charts.tsx` and the
  five bespoke charts (`CorridorChart`, `StripCharts`, `AltVelChart`, `HeatGLoadCharts`,
  `GroundTrackMap`) to consume it. Fold `lib/palette.ts` `SERIES`/`STATUS` into `ui/tokens.ts`
  (re-export shim if any import churn).
- **Green:** `test:web` + `build:web`; charts render. Commit.

### Stage 5 — Nav shell
- `shell/nav.ts` (`NAV_GROUPS`: Simulators / Studio / Analysis / Learn; Phase 9+ as disabled
  placeholders), `shell/Sidebar.tsx`, `shell/Header.tsx`, `shell/AppShell.tsx`.
- Rewrite `App.tsx` to render `AppShell`, **keeping one-view-mounted semantics** (unmount stops
  rAF/workers). Remove `.app-header`/`.tab-bar` CSS once unused.
- **Green:** `build:web`; every existing destination reachable. Commit.

### Stage 6 — Refit A / B / C
- Swap `.field` / local `Num` / `.panel` / `.btn` usages to the new primitives; re-point remaining
  module CSS to tokens. Representative: `modules/rocket/ConfigPanel.tsx` (`Num`→`NumberField`,
  `.panel`→`Panel`, run button→`Button`). No behavior changes.
- **Green:** `test:web` + `build:web`; A/B/C render on tokens. Commit per module.

### Stage 7 — Re-skin D + Overview
- Convert `.lc-*` and `.ov-*` to the unified tokens/accent/fonts; delete the `--l-*` / `--ov-*`
  blocks in `styles.css` and their `palette.ts` mirrors. Layouts/behavior unchanged.
- **Green:** `test:web` + `build:web`; D playback + Overview envelope still animate at 60 fps.
  Commit.

### Stage 8 — Design-system doc + finalize
- `docs/design-system.md`: tokens, component inventory + usage, do/don't.
- Full manual click-through (verification checklist below). Flip roadmap Phase 8 → done.
- Optional: request code review; finish the branch (merge/PR per user).

## Verification (per stage + final)
- `npm run test` — packages/golden runs green (must never change; no `packages/*` edits).
- `npm run test:web` — front-end unit + primitive tests green.
- `npm run build:web` — `tsc --noEmit` + vite build passes.
- Manual: `npm run dev:web`; visit Overview + A/B/C/D; one accent/type/spacing everywhere; charts
  unified; sidebar works; no console errors; 60 fps on D playback + A telemetry.

## Risks / notes
- **Font swap** touches `main.tsx` + everything referencing `--l-display`/`--ov-display`; done in
  Stage 7 when those tokens are retired.
- **Drag-to-scrub** (`NumberField`) needs pointer-capture + jsdom-friendly tests (dispatch pointer
  events, assert value deltas).
- **palette.ts fold-in** may ripple imports across chart files — keep a thin re-export during
  Stage 4 to stage the change.
