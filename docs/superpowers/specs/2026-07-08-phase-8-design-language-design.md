# Phase 8 — Design Language & Information Architecture (Design Spec)

**Status:** approved 2026-07-08 · **Roadmap phase:** 8 (see `finalproductroadmap.md`)
**Plan:** `docs/superpowers/plans/2026-07-08-phase-8-design-language.md`

## 1. Why

Phase 8 is the first phase of the final-product upgrade. Every later phase (the rocket design
studio, Monte Carlo, airbrakes, optimization, the educational layer) is built **on top of** the
UI this phase establishes, so the design language and navigation are built **once**, in their
final form, rather than restyled repeatedly.

Today the web app carries three coexisting dark style generations:

1. **Flat cockpit chrome** — `.panel/.stat/.chip/.btn` in `apps/web/src/styles.css`, `system-ui`
   font, `--series-*` color tokens. Used by Modules A (rocket), B (reentry), C (aircraft).
2. **Overview front door** — `--ov-*` tokens, blueprint-void aesthetic, Saira Condensed +
   Space Mono. (`features/overview/`)
3. **Module D mission-control** — `--l-*` tokens, `.lc-*` classes, ignition-amber accent, same
   Saira/Space Mono fonts. (`features/landing-sim/`)

`styles.css` is a single 1,105-line file with no typed token layer; `lib/palette.ts` mirrors the
colors by hand. The flat `.tab-bar` in `App.tsx` (five buttons) will not scale to Simulators A–D
plus Studio, Analysis (Monte Carlo, Optimization), and Learn. No form/editor primitives exist for
the studio Phase 9 needs.

## 2. Locked decisions (2026-07-08)

Confirmed with the user during brainstorming; do not re-litigate:

- **Fresh, unified language — "Precision Instrument."** A new direction, *not* derived from any
  current module. Graphite base; a single **cyan-teal** signature accent (retiring Module D's
  amber); hairline dividers rather than heavy borders; depth from soft elevation; quiet, fast
  motion (120–200 ms, `transform`/`opacity` only). Calm, dense-capable, trustworthy, smooth.
- **Dark-first, light-ready.** Ship dark only. Structure tokens **semantically** (surface/ink/
  accent, not raw hex at call sites) so a `[data-theme="light"]` block can be added later for the
  Phase 13 Learn/portfolio tier without re-architecting. No light *values* are authored now.
- **Navigation:** a **left sidebar rail** (grouped, collapsible) + a slim top header.
- **Typography:** **Inter** (prose/UI) + **JetBrains Mono** (numerics/telemetry), bundled offline
  via `@fontsource` (no CDN). Retire Saira Condensed + Space Mono.
- **Module D + Overview fully converge** onto the unified tokens/accent/fonts; they keep their
  layouts and behavior but drop the bespoke amber/blueprint palettes.
- **Progress tracking:** live **Status** column in `finalproductroadmap.md` — no separate file.

## 3. Scope

**In:** a typed token system, a shared React UI kit (chrome + studio form primitives), a
token-fed chart theme, a scalable sidebar shell, and a refit of all existing A–D + Overview views
onto it.

**Out (guardrails):**
- **No changes under `packages/*`** and **no feature or physics/behavior changes** to any module.
  This is a styling + IA refit. Existing physics/golden tests (`npm run test`) must stay green,
  unchanged.
- No light-theme values (only the token seam is reserved) — Phase 13/14.
- No studio features (they consume these primitives) — Phase 9.
- No full a11y/onboarding/perf audit — Phase 14.

## 4. The system

### 4.1 Tokens — `apps/web/src/ui/tokens.ts` + `tokens.css`

Two tiers: **primitive** ramps (raw hex) → **semantic** aliases. Only semantic names appear at
call sites. `tokens.ts` is the authoritative typed source consumed by JS marks (SVG/canvas/
Recharts); `tokens.css` mirrors it as `:root` custom properties for CSS — the same paired
convention `palette.ts ↔ styles.css` uses today, so the two can never silently drift.

Token groups:
- **Color:** `bg / surface / surface-2 / elevated`; `ink / ink-2 / muted`; `border / hairline`;
  `accent / accent-dim` (cyan-teal); `series-1..6` (categorical, fixed order); status
  `good / warning / serious / critical`.
- **Type:** families (`--font-sans` Inter, `--font-mono` JetBrains Mono); a modular size scale;
  weights; line-heights; letter-spacing.
- **Space:** 4 px base — 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Radii:** sm / md / lg / pill. **Elevation:** 2–3 shadow tokens. **Motion:** durations
  (fast/base/slow) + standard/emphasized easings. **Z-index:** base / sticky / overlay / modal /
  toast.

A reserved (empty for now) `:root[data-theme="light"]` block documents the light seam.

### 4.2 Chrome primitives — `apps/web/src/ui/`

`Panel`, `Stat`, `Chip` (good/warning/critical/neutral), `Button`
(primary/secondary/danger; sizes; `disabled` / `busy`). Token-driven, replacing the
`.panel/.stat/.chip/.btn` CSS classes. Each: typed props, accessible, no feature logic.

### 4.3 Studio form/editor primitives — `apps/web/src/ui/`

The set the design studio (Phase 9) will build on:
- `Field` — label + control + hint + error wrapper.
- `NumberField` — SI unit suffix, **drag-to-scrub** on the label, clamp/step, keyboard ↑/↓.
- `Select`, `Slider`, `TextField`.
- `Tree` — the component-tree editor primitive for Phase 9d.
- `Tabs`, `Toolbar`, `Modal` (focus-trap + Esc).

All accessible (labels, roles, keyboard, visible focus ring) and unit-tested with React Testing
Library. Each is understandable and testable on its own: clear props in, styled/accessible markup
out, no simulation logic inside.

### 4.4 Chart theme — `apps/web/src/ui/chartTheme.ts`

One object derived from tokens supplying axis / grid / tooltip / legend styling. `lib/charts.tsx`
(`TimeChart`) and the bespoke charts — `CorridorChart`, `StripCharts`, `AltVelChart`,
`HeatGLoadCharts`, `GroundTrackMap` — consume it so every chart reads as one system. Series color
assignment stays in `SERIES` (fixed order, assigned per entity, never cycled), folded into
`tokens.ts`. Charts keep their current rules: one y-scale per chart, thin 2 px lines, recessive
grid, crosshair tooltip, legend only for ≥ 2 series.

### 4.5 Navigation shell — `apps/web/src/shell/`

`AppShell` = `Sidebar` (grouped `NAV_GROUPS`, active-item highlight, collapsible) + `Header`
(app title; room for a future theme toggle) + a `<main>` outlet. It **preserves the current
one-view-mounted router behavior** from `App.tsx` — mounting one view at a time, so unmounting a
view stops its `requestAnimationFrame` loop and workers (three real-time views never compete for
the main thread). Groups are data-driven in `nav.ts`:

- **Simulators:** A · Rocket, B · Reentry, C · Aircraft, D · Landing (plus Overview as the home).
- **Studio:** Rocket Design Studio — *placeholder / "coming soon"* (Phase 9).
- **Analysis:** Monte Carlo, Optimization — *placeholders* (Phases 10, 12).
- **Learn:** *placeholder* (Phase 13).

Later phases add a destination by adding a `nav.ts` entry and a view — no shell changes.

## 5. Isolation & clarity

New code is split by responsibility so each unit is small and testable: `ui/tokens.*` (values
only), one file per primitive (props in → accessible markup out), `ui/chartTheme.ts` (tokens →
Recharts props), `shell/*` (navigation only, no module logic). The 1,105-line `styles.css` — which
does too much — is split into `ui/tokens.css` (values), `ui/base.css` (reset/html/body/focus),
and `ui/ui.css` (component styles). `lib/palette.ts` is absorbed into `ui/tokens.ts`.

## 6. Verification

- **Physics untouched:** `npm run test` (packages + golden runs) stays green — no `packages/*`
  edits.
- **Front-end:** `npm run test:web` green (existing + new primitive tests);
  `npm run build:web` (`tsc --noEmit` + vite build) passes.
- **End-to-end (manual):** `npm run dev:web`; visit every destination (Overview, A, B, C, D);
  confirm each renders on the new tokens, charts read as one system, the sidebar works, and there
  are no console errors.
- **Motion/perf:** transitions limited to `transform`/`opacity`; spot-check 60 fps on the D
  landing playback and the A telemetry (the animation-heavy views).
- **Visual:** all views share one accent / type / spacing; no residual amber, blueprint, or
  `system-ui` chrome remains.

## 7. Definition of done

Every A–D + Overview view renders on the unified "Precision Instrument" system; the shared UI kit
and token layer exist and are tested; charts are themed from tokens; the sidebar shell is in place
with Phase 9+ placeholders; a design-system reference lives in `docs/`; and the roadmap's Phase 8
Status is flipped to done. Physics core and its tests are provably untouched.
