# Final-Product Upgrade — Master Roadmap

**Status:** approved 2026-07-07 · **This document is the durable anchor for all future sessions.** Every session working on the final-product upgrade re-anchors by reading this roadmap plus the active phase's plan in `docs/superpowers/plans/`.

## 1. Context

The suite has completed all original phases 0–7 including stretch goals: four modules (A rocket ascent, B reentry, C aircraft, D landing) on a dependency-free TS physics core; React 19 + Vite + Three.js + Recharts web app with web workers; ~42 test files / ~307 Vitest cases; npm workspaces (not pnpm).

This roadmap evolves the suite into a **finalized product** by absorbing the best features of the OpenRocket ecosystem, adding an educational layer, and putting everything on a UX-first clean UI. Sessions are budget-constrained: work is session-sized, and every artifact is committed so `continue`/compaction never loses state.

**Locked-in decisions (2026-07-07) — do not re-litigate:**

- **Platform:** the web app stays the product; Unity only as an optional post-roadmap trajectory *viewer* (E1). No port.
- **OpenRocket must-haves:** all four — design studio, Monte Carlo, airbrakes, optimization.
- **AI/ML:** follow-on research track (R1) after the product ships; the roadmap enables it via Monte Carlo data export.
- **Educational audience:** all three tiers — students (plain language), portfolio (validation storytelling), coursework (full derivations).
- **UX sequencing:** design language phase first, features built once in the final language, light polish pass at the end.

**Reference material:** a downloaded OpenRocket reference collection (12 repos + 11 curated summary MDs, ~583 MB) lives at `OpenRocket/` in the local working copy only — it is intentionally not committed. Remote/fresh sessions substitute the research digest below, or the curated summary MDs can be committed to `docs/references/` if durable access is needed.

## 2. Research digest — what the best comparable projects do, and what we adopt

**OpenRocket** (Java desktop; the gold standard). Extended-Barrowman aerodynamics (any fin count, body lift, fin-body interference, pitch/roll damping), 6-DOF simulation, multi-stage + clustering + pods, integrated motor database, multi-level wind, Monte Carlo, automatic design optimization, freeform fins, OBJ/SVG component export. Niskanen's technical documentation (openrocket.sourceforge.net/techdoc.pdf, CC-BY-SA) is the authoritative reference for the Phase 9b equations: per-component CP/CNα, drag buildup (nose pressure, base, Reynolds-dependent skin friction, fin), transonic corrections, pink-noise wind turbulence. **Adopt:** the extended-Barrowman formulation, the drag-buildup structure, and OpenRocket's own outputs on known rockets as validation oracles.

**RocketPy** (Python; state of the art in validation, github.com/RocketPy-Team/RocketPy). Validated against real university flights — apogee within 0.45%, max velocity within 2.31% (Journal of Aerospace Engineering); native Monte Carlo for dispersion and global sensitivity analysis; wind from soundings/forecast ensembles; hundreds of derived outputs; KML/3D trajectory export. **Adopt:** the validation-against-published-flights culture (feeds the Phase 13 portfolio tier), dispersion + sensitivity-ranking outputs in Phase 10, layered wind profiles.

**ORBrake** (github.com/WPI-HPRC/ORBrake) and **or-airbrake-plugin** (github.com/waterloo-rocketry/or-airbrake-plugin). OpenRocket airbrake plugins. Key lessons: control on **predicted apogee** (even a simple ballistic projection) rather than current altitude — ORBrake hit within ~2 ft of target after this change; drag force = f(extension) × dynamic pressure; tunable PID (Kp/Ki/Kd + target apogee); active only during coast above a minimum-velocity gate (~23.5 m/s). **Adopt:** this exact control architecture for Phase 11.

**OpenRocketQD** — "A Quality Diversity Approach to Evolving Model Rockets" (GECCO 2025, arXiv:2504.02177). MAP-Elites / CMA-ME / CMA-MAE over nose+fin+body design space using OpenRocket as the evaluator; CMA-ME produced the widest design variety; selected designs were built and flown. **Adopt:** MAP-Elites archive + behavior-map visualization as the Phase 12 centerpiece (GA as baseline), evaluated on the Phase 10 worker pool.

**ThrustCurve.org.** REST API (JSON) with search / metadata / download endpoints serving `.eng` (RASP) and `.rse` (RockSim XML) files plus parsed sample points (`data=samples`); the `thrustcurve-db` npm package rebundles the whole database as one offline JSON. **Adopt:** `.eng`/`.rse` parsers + a curated offline motor snapshot for Phase 9c (offline-first, deterministic), optional live API search layered behind it.

## 3. The roadmap

Each phase runs its own brainstorm → spec → plan → execute cycle.

| # | Phase | Size | Depends on | Status | Key references |
|---|---|---|---|---|---|
| 8 | Design language & IA | M | — | 🔨 in progress | frontend-design + dataviz skills at exec time |
| 9 | Rocket design studio | XL (9a–9d) | 8 | ⬜ not started | OpenRocket techdoc; local `OpenRocket/` MDs |
| 10 | Monte Carlo & dispersion | L | 9 | ⬜ not started | RocketPy MC docs; `OR Monte Carlo.md` |
| 11 | Airbrakes (active control) | M | 9 | ⬜ not started | ORBrake, or-airbrake-plugin |
| 12 | Design optimization | M/L | 9 (+10 infra) | ⬜ not started | arXiv:2504.02177 |
| 13 | Educational layer | L | 9–12 stable | ⬜ not started | `docs/equations.md`, README §11/§13/§14 |
| 14 | Final polish & finishing | M | all | ⬜ not started | — |
| R1 | AI/ML research track | post-ship | 10 | ⬜ not started | RocketSerializer, orhelper concepts |
| E1 | Unity companion viewer | optional | trajectory export | ⬜ not started | golden-run JSON format |

**Status legend:** ⬜ not started · 🔨 in progress · ✅ done. Update the Status cell when a phase
starts and when it merges. The active phase also gets a stage checklist in **§3.1 Live status**
below — the single source of truth for cross-session progress (no separate progress file).

### 3.1 Live status

**Active phase: 8 — Design language & IA.**
Spec: `docs/superpowers/specs/2026-07-08-phase-8-design-language-design.md` ·
Plan: `docs/superpowers/plans/2026-07-08-phase-8-design-language.md` ·
Branch: `phase-8-design-language`.

- [x] Stage 0 — Spec + plan committed; roadmap Status tracking stood up
- [x] Stage 1 — Fonts (Inter + JetBrains Mono) + typed token layer (`ui/tokens.ts`/`.css`, `base.css`)
- [x] Stage 2 — Chrome primitives (`Panel/Stat/Chip/Button`) + tests
- [x] Stage 3 — Form/editor primitives (`Field/NumberField/Select/Slider/TextField/Tree/Tabs/Toolbar/Modal`) + tests
- [x] Stage 4 — Chart theme (`ui/chartTheme.ts`); refit charts; fold in `palette.ts`
- [ ] Stage 5 — Nav shell (left sidebar `AppShell/Sidebar/Header/nav.ts`)
- [ ] Stage 6 — Refit A/B/C onto tokens + primitives
- [ ] Stage 7 — Re-skin D + Overview onto the unified language
- [ ] Stage 8 — Design-system doc + finalize; flip Phase 8 → ✅

**Progress log** (newest first):
- 2026-07-09 — Stage 4 done. Added `ui/chartTheme.ts` (token-derived axis/grid/tooltip/legend +
  categorical `SERIES`/`STATUS`); refit `lib/charts.tsx` (TimeChart) and the five bespoke charts
  (Corridor/Strip/AltVel/HeatGLoad/GroundTrack) to consume it. Folded `SERIES`/`STATUS` into the
  token layer — `lib/palette.ts` is now a shim re-exporting them (neutrals kept literal for the
  not-yet-migrated SVG/3D widgets; `LANDING`/`OVERVIEW` retired in Stage 7). Charts now render on the
  brand palette. `build:web` + `test:web` (58) + packages `test` (331, physics untouched) all green.
- 2026-07-09 — Stage 3 done. Added the studio form/editor primitives: `Field` (label/control/
  hint/error skeleton + a11y wiring), `NumberField` (SI unit, drag-to-scrub, clamp/snap, keyboard
  ↑/↓ ×10), `TextField`, `Select`, `Slider` (native-backed for free a11y), `Tabs` (roving focus),
  `Toolbar` (+Separator/Spacer), `Tree` (ARIA tree, expand/collapse, keyboard, selection-follows-
  focus), `Modal` (portal, focus-trap, Esc, focus restore). 17 RTL tests. `build:web` + `test:web`
  green (58 tests).
- 2026-07-09 — Stage 2 done. Added the chrome primitives `Panel`, `Stat`, `Chip` (6 tones),
  `Button` (primary/secondary/danger · sm/md · `busy`/`disabled`) with token-driven `ui/ui.css`
  (`fd-*` namespaced) and a barrel `ui/index.ts`. 16 RTL contract tests. Not yet wired into modules
  (Stage 6). `build:web` + `test:web` green (41 tests).
- 2026-07-09 — Stage 1 done. Added Inter + JetBrains Mono (variable, `@fontsource-variable`);
  created the typed token layer `ui/tokens.ts` + mirrored `ui/tokens.css` (two-tier
  primitive→semantic, `--fd-*`, graphite + cyan-teal, light seam reserved) and `ui/base.css`
  (reset/body/focus, re-pointed to tokens + Inter). Saira/Space Mono kept until Stage 7 (still used
  by `--l-*`/`--ov-*`). `build:web` + `test:web` green (25 tests).
- 2026-07-08 — Phase 8 brainstormed and planned. Locked: fresh "Precision Instrument" language,
  dark-first/light-ready tokens, left-sidebar nav, Inter + JetBrains Mono, full D/Overview
  convergence. Spec + plan committed; progress tracking stood up. Build not yet started.

### Phase 8 — Design language & information architecture (M)

**Problem:** the current UI is three generations of style — shared `.panel/.stat/.chip/.btn` chrome (Modules A/B/C in `apps/web/src/styles.css`), the Overview envelope map, and Module D's scoped mission-control look (`.landing-*`/`.lc-*`, `--l-*` tokens). The top tab bar in `apps/web/src/App.tsx` won't scale to 6+ modules plus a Learn section, and no form/editor patterns exist for the studio.

**Work:**
- Audit `styles.css`, `lib/palette.ts`, `lib/charts.tsx`, and Module D's scoped styles; pick the winning language (likely evolve Module D's mission-control look into the global one).
- Define tokens — type scale, color (light/dark), spacing, radii, elevation, motion durations/easings — as CSS custom properties plus a typed `tokens.ts`.
- Extract shared React components: `Panel`, `Stat`, `Chip`, `Button`, plus the new form/editor primitives the studio needs (`NumberField` with units and drag-to-scrub, `Select`, `Slider`, `Tree`, `Tabs`, `Toolbar`, `Modal`).
- Chart theming layer over Recharts (axis/grid/tooltip styles fed from tokens) so all modules' charts read as one system.
- IA/navigation that scales: grouped nav (Simulators A–D + Studio · Analysis: Monte Carlo, Optimization · Learn) replacing the flat tab bar.
- Light refit of existing A–D views onto the new tokens/components (no feature changes).

**Deliverables:** design-system doc in `docs/`, shared component/style layer, refit views. Motion stays 60 fps. Use frontend-design + dataviz skills during execution.

### Phase 9 — Rocket design studio (XL — the heart of OpenRocket, in TS)

New workspace package `packages/rocket-design/` (pure TS, no DOM, like the other packages). The studio **generates** the inputs the existing 6-DOF sim already consumes — aero tables (`packages/rocket-sim/src/aero.ts` format), thrust curves (`propulsion.ts` format), mass properties — so core dynamics files stay untouched; any unavoidable core extension requires validation tests and golden-run guards.

- **9a Component model:** parametric parts — nose cones (conical, ogive, parabolic, power-series, Haack), body tubes, transitions, trapezoidal fin sets (freeform later), launch lug/rail guides, inner tubes/couplers, mass components (parachute, avionics, ballast). Each part: geometry + material (curated density table) → mass, CG, inertia tensor; assembly aggregation reusing `physics-core` matrix/vector utilities and `massProperties.ts` conventions. Curated parts data in `data/parts/`.
- **9b Aerodynamics (extended Barrowman, per the techdoc):** per-component CNα and CP (nose, transition, N-fin sets), body-lift correction, fin-body interference, pitch damping; stability margin in calibers. Drag buildup: nose pressure drag by shape, base drag, Reynolds-dependent skin friction with roughness, fin profile drag, interference — assembled into CD(Mach, α) tables in the exact format `aero.ts` loads. Subsonic first; transonic corrections as a documented stretch.
- **9c Motors & recovery:** `.eng` (RASP) and `.rse` (RockSim XML) parsers into the existing thrust-curve format (`data/thrust-curves/`); curated offline motor snapshot (seeded from thrustcurve-db / openrocket motor-database) in `data/motors/` with impulse-class metadata; optional live ThrustCurve.org search behind the offline store. Recovery: deployment events (apogee, altitude AGL, timer), drogue + main staging, parachute CD·S descent.
- **9d Builder UI:** `apps/web/src/features/design-studio/` — component-tree editor (Phase 8 form primitives), live 2D side-view SVG schematic with CP/CG markers and stability readout in calibers, mass/length/CD summary, motor picker with impulse-class filter and thrust-curve preview, "Fly it" → existing ascent worker and landing pipeline. Persistence: localStorage + YAML import/export in README §9 schema style.
- **Validation:** Barrowman unit tests against hand-computed techdoc values; whole-vehicle CP/CG/apogee cross-check against OpenRocket's outputs for a known rocket (Estes Alpha III and/or TrinetraOne); existing golden runs (`tests/golden-runs/`) stay green to prove the core sim is untouched.

### Phase 10 — Monte Carlo & dispersion (L)

- **Wind:** layered profiles (power-law/log shear) and pink-noise gust/turbulence model in `packages/atmosphere-models` (extend `wind.ts`) — additive and behind config flags so existing runs stay bit-identical.
- **Perturbation config:** per-parameter distributions (normal/uniform/triangular) over thrust multiplier, CD multiplier, dry mass, rail angle + azimuth, wind speed/direction, ignition/deployment delays. **Seeded deterministic PRNG** (PCG/xorshift — no `Math.random()` in the loop); a run with seed S is exactly reproducible.
- **Execution:** worker-pool batch runner (`navigator.hardwareConcurrency`), chunked with streaming progress, reusing existing worker patterns (`apps/web/src/lib/simWorker.ts`).
- **Outputs (RocketPy benchmark):** landing-scatter plot with 1σ/2σ/3σ confidence ellipses, apogee/max-Q/max-accel histograms, percentile table, input-sensitivity ranking (tornado chart). CSV/JSON dataset export — the **training-data factory for R1**.

### Phase 11 — Airbrakes (M)

- Airbrake as a studio component: drag increment = f(extension) × dynamic pressure (drag-area table per extension), with actuator rate limit.
- **Control (ORBrake lesson):** each step, predict apogee via ballistic projection from current state; PID (extends `packages/rocket-sim/src/control/pid.ts`) on (predicted apogee − target); active only in coast above a minimum-velocity gate.
- UI: target-apogee input, extension-command and predicted-apogee traces, with/without overlay, achieved-vs-target verdict. Validation: closed-loop tests hitting target within tolerance across the Phase 10 perturbation set.

### Phase 12 — Design optimization (M/L)

- **Genome:** studio design params — fin count/root/tip/span/sweep, nose shape/length, body length, motor selection (categorical). **Objectives:** max altitude, target-apogee error, mass/cost. **Constraints:** stability-margin window (~1–2 cal), minimum rail-exit velocity.
- **Algorithms:** GA baseline, then MAP-Elites archive with a 2D behavior space (e.g. stability margin × length, or altitude × mass); CMA-ME as stretch (widest variety per the GECCO paper).
- **Infra:** evaluations on the Phase 10 worker pool, deterministic seeds. **UI:** behavior-map heatmap (click a cell → load that elite into the studio), convergence plot, elite gallery.

### Phase 13 — Educational layer (L)

Three tiers in one UI:
1. **Students:** plain-language concept cards + hover glossary (terms seeded from README §13).
2. **Coursework:** expandable "show the math" panels (KaTeX) grown from `docs/equations.md`, which already maps every equation to source files and sign conventions.
3. **Portfolio:** methodology/validation page — validation storytelling in the RocketPy mold: what was tested against what (README §11 suite, golden runs, Phase 9 OpenRocket cross-checks), error percentages, references (README §14).

Plus guided interactive lessons per module (a step sequencer driving live sim parameters).

### Phase 14 — Final polish (M)

Full-surface UX audit against the Phase 8 system, motion/perf pass (60 fps, worker offload), onboarding + empty states, a11y (keyboard nav, ARIA, contrast), README/site docs refresh.

### R1 — AI/ML research track (post-ship; separate Python `ml/` workspace)

Surrogate models (design params → apogee/trajectory) trained on Phase 10 MC exports; compare sim vs surrogate vs **real flight data** (ThrustCurve.org motor data, Altus Metrum public logs, RocketPy published validation flights, BPS.space CSVs, university team telemetry).

### E1 — Unity companion viewer (optional)

Export trajectory JSON (golden-run format exists) → Unity playback scene for cinematic/VR. Never the source of truth.

## 4. Working model

- One phase at a time: brainstorm → spec committed to `docs/superpowers/specs/` → plan committed to `docs/superpowers/plans/` → TDD execution → verification → code review → merge.
- Commit at every green checkpoint so compaction/`continue` costs nothing.
- Repo conventions: npm (not pnpm); commits authored roasteduck04 only, no co-author trailers; SI units internally; deterministic physics; don't modify shared physics from front-end work.

## 5. References

- OpenRocket: github.com/openrocket/openrocket · technical doc: openrocket.sourceforge.net/techdoc.pdf
- RocketPy: github.com/RocketPy-Team/RocketPy · docs.rocketpy.org
- ORBrake: github.com/WPI-HPRC/ORBrake · or-airbrake-plugin: github.com/waterloo-rocketry/or-airbrake-plugin
- Quality-diversity rockets: arxiv.org/abs/2504.02177 (GECCO 2025)
- ThrustCurve API: thrustcurve.org/info/api.html · thrustcurve-db: github.com/broofa/thrustcurve-db · github.com/openrocket/motor-database
