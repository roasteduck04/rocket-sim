# Landing Sim — SpaceX-Style Reentry-to-Landing Visual Simulation

**Date:** 2026-07-04
**Status:** Approved design, pre-implementation
**Origin:** `landing-sim-fable-prompt.md` (root), refined through brainstorming. Where this
spec and that prompt differ, this spec wins.

## 1. What it is

A new top-level web-app module — tab **`D · Landing`** — where the user drags an entry
point (altitude/velocity) onto a capture-region plot, sets flight-path angle γ and
downrange offset, and hits **Launch**. The rocket then flies itself from tens of km down
to the pad — freefall → entry burn → freefall → landing burn → touchdown — rendered as
one continuous cinematic shot with a live telemetry HUD. It sticks the landing or fails
visibly in one of five distinct ways. No mid-flight user input: it is a
"watch it try to land itself" simulation.

## 2. Decisions made during brainstorming

| Question | Decision |
|---|---|
| Flight sequence | **High-altitude entry** (tens of km, real velocity), not terminal-descent-only and not full boostback-from-staging |
| Placement | **New top-level tab `D · Landing`**, feature self-contained under `apps/web/src/features/landing-sim/` |
| Pacing | **Time-warp control** 1×/2×/5×/10× (default 5×); physics unaffected — warp is playback rate |
| Entry burn | **In scope for v1** — a thin, configured guidance layer (trigger + retrograde burn to a target speed) |
| Architecture | **Approach A: precompute in a worker, then cinematic playback** (see §3) |

## 3. Architecture — precompute + playback

Because the vehicle flies itself, running the whole sim headless first and *playing back*
the recording is visually indistinguishable from live stepping — and buys determinism,
pause/scrub/replay, and an exact T− countdown for free.

```
┌─ D · Landing tab ──────────────────────────────────────────┐
│  SETUP mode                          FLIGHT mode           │
│  ┌──────────────────┐    Launch     ┌──────────┬────────┐  │
│  │ EntryPointSelector│ ───────────▶ │ Canvas   │  HUD   │  │
│  │ (drag v/h point,  │              │ (playback│ (live  │  │
│  │  γ dial, offset,  │              │  render) │ fields)│  │
│  │  capture shading) │              ├──────────┴────────┤  │
│  └────────┬─────────┘              │ ▶⏸ 1× 2× 5× 10× ──○─│  │
│           │                        └───────────────────┘  │
│           ▼ (grid sweep)      ▲ (full telemetry, <1s)      │
│  ┌───────────────────── descent.worker.ts ──────────────┐  │
│  │  msg "capture": sweep entry grid → outcome grid      │  │
│  │  msg "run": full sim → frames + summary + phase times│  │
│  └──────────────────────────────────────────────────────┘  │
```

One worker (`descent.worker.ts`, same pattern as the existing `corridor.worker.ts`), two
message types:

- **`capture`** — sweeps a grid over (entry velocity × entry altitude) at the currently
  set γ and downrange offset, one coarse-dt sim per cell, returning an outcome grid
  (lands / survives-but-misses / crashes). Recomputed (debounced ~300 ms) only when γ or
  offset changes; dragging the main point costs nothing.
- **`run`** — the full descent once at the real `dt = 0.01 s`. Returns the complete
  telemetry array, `LandingSummary`, and phase timestamps (entry-burn ignition/cutoff,
  landing-burn ignition).

**Playback engine** (`usePlayback.ts`): a rAF clock maps wall time × warp → sim time,
binary-searches the frame array, and interpolates position/attitude/scalars between
frames. Pause, scrub, warp, and replay are operations on the clock only.

**Verdict** is computed once when the run returns, but revealed only when playback
reaches touchdown — no spoilers in the HUD.

## 4. Guidance layer — `entryDescentGuidance`

The only new code in `packages/rocket-sim`: `src/guidance/entryDescent.ts`, a phase
machine structured like the existing `boostbackGuidance` (delegation, exposed
timestamps). **No new physics; no duplicated formulas.**

Phases: **`coast → entryBurn → descent`**

1. **coast** — throttle 0, gimbal 0 (no thrust ⇒ no authority; same convention as
   `landing.ts`). Ballistic fall with real drag.
2. **entryBurn** — ignites when altitude first crosses below `entry_burn.ignite_altitude_m`.
   Thrust axis held retrograde (along −velocity) via the existing
   `AttitudeController.updateDirection` (the mechanism `boostbackGuidance` already uses),
   full throttle, until airspeed < `entry_burn.target_speed_mps` → engine cut, back to
   ballistic fall.
3. **descent** — every subsequent command delegates to the validated
   `poweredDescentGuidance` (its own coast → suicide-burn ignition → touchdown; both the
   ignition formula and the PID cascade are reused, not reimplemented).

Exposed getters for telemetry/tests: `entryBurnIgnitionTime`, `entryBurnCutoffTime`,
`landingIgnitionTime`, `phase`.

**Config** (README §8.1 schema; read from config, never hardcoded) — one new optional
block under `control.descent`:

```yaml
entry_burn:
  ignite_altitude_m: 30000   # begin retro burn crossing this AGL
  target_speed_mps: 900      # cut engine once |V| falls below this
```

Absent block ⇒ guidance goes straight `coast → descent` (identical to today's
`poweredDescentGuidance` behavior). The reference booster yaml gains sensible defaults.

**Entry state construction** (worker-side, like the existing `initialDescentState`):
build the initial `RocketState` from the four user inputs — position offset from the pad,
velocity vector tilted by γ, attitude initialized retrograde (engine-first). Initial-
condition plumbing, not dynamics.

## 5. Web feature — files and responsibilities

All under `apps/web/src/features/landing-sim/`, plus one tab entry in `App.tsx`:

| File | One job |
|---|---|
| `LandingSimView.tsx` | Layout + mode switch (setup ↔ flight), owns the worker |
| `EntryPointSelector.tsx` | SVG drag-point input + capture-region shading |
| `descent.worker.ts` | `capture` + `run` messages (§3) |
| `usePlayback.ts` | Playback clock: warp, pause, scrub, interpolated frame |
| `LandingCanvas.tsx` | Canvas renderer: rocket, flame, ground, pad, camera |
| `Dashboard.tsx` | HUD telemetry panel |
| `verdict.ts` | Pure pass/fail classifier (§7) |
| `types.ts` | Local types: phase labels, verdict, worker messages |

**EntryPointSelector** — SVG (static plot; canvas is reserved for the animation): x =
entry speed, y = entry altitude, one draggable dot; capture grid rendered as shaded cells
behind it (green = lands, amber = survives-but-misses, red = crash), visual language
matching the reentry module's CorridorChart. γ dial and downrange-offset slider sit
beside the plot; changing either greys the shading until the fresh grid arrives.

## 6. Rendering — flat vector canvas, one continuous shot

Flat icon-style vector art on `<canvas>` (redrawn every frame; SVG DOM is not used for
the animation): sky gradient darkening with altitude (near-black at 40 km → blue near
ground), horizon line, pad as a marked circle with an ⓧ, rocket as a simple silhouette
drawn at its true pitch angle, flame as a throttle-scaled triangle with subtle flicker.

**Camera model — continuous dynamic zoom:**

- Vertical view window `H_view = clamp(k · h, H_min, H_max)`: the window shrinks as
  altitude drops, so the rocket grows through the descent and fills the frame for the
  final approach.
- Rocket anchored at ~65 % frame height while high; as h → 0 the ground rises into frame
  and the camera settles so touchdown happens at a fixed, composed ground line.
- Horizontal scale follows the same zoom, keeping the downrange offset and pad divert
  visible.
- `worldToScreen(state, cameraParams) → px` is a pure function — unit-testable without a
  canvas.

Rendering interpolates between physics frames (supplied by the playback engine), so
60 fps smoothness holds at any warp.

## 7. HUD, verdict, failure modes

**HUD fields** (all update from the current playback frame):

| Field | Source |
|---|---|
| Altitude, v_z, v_horiz, speed, Mach, q̄ | Directly in `TelemetryFrame` |
| Throttle, δp, δy, pitch θ | Directly in `TelemetryFrame` |
| Propellant % | `(mass − dryMass) / propellantMass` from config |
| g-load | Finite difference of NED velocity between adjacent frames + gravity correction — computed at playback; physics packages untouched |
| Guidance phase | Phase timestamps vs current sim time: `FREEFALL → ENTRY BURN → FREEFALL → LANDING BURN → TOUCHDOWN` |
| T− countdown | `t_touchdown − t_now` (exact — the recording is complete) |

Sign/color conventions follow the existing `palette.ts` / `unitsDisplay.ts` (nose-up
positive θ, suite STATUS colors). No new conventions.

**Verdict** — pure function `(summary, finalFrames, config) → Verdict`, priority order
(first match wins):

1. **RUD** — impact speed above config threshold
2. **Out of propellant** — mass reached dry mass before touchdown, velocity un-nulled
3. **Hard landing** — `|touchdownVz| > touchdown_vz_max_mps`
4. **Tip-over** — tilt angle at touchdown exceeds `touchdown_tilt_max_deg`
5. **Missed pad** — `missDistance > pad_radius_m`, all else nominal
6. **SUCCESS** — all criteria met

New config values (configurable, not invisible hardcodes) in the `landing_target` block:
`pad_radius_m` (default 15), `touchdown_tilt_max_deg` (default 5), and
`rud_impact_speed_mps` (default 25).

**Failure visuals** — second pass, before the feature is called done (not deferred
indefinitely): success path ships first with a color-coded text verdict chip; the
distinct per-failure animations (crumple, tip-over rotation, explosion burst, pad-miss
marker) follow.

## 8. Testing

Extends the existing vitest suite:

- **`tests/validation/entry-descent.test.ts`** (package level):
  - Phase-machine transitions at the configured altitude/speed; delegation to
    `poweredDescentGuidance`.
  - Touchdown `|v_z|` converges below `touchdown_vz_max_mps` across a grid of entry
    altitudes/velocities inside the capture region (the Section-10 convergence pattern,
    extended to this feature's entry ranges).
  - Entry burn effectiveness: peak q̄ and peak Mach strictly lower with the burn than
    without, same entry state.
  - Graceful degradation: no `entry_burn` block ⇒ identical to plain
    `poweredDescentGuidance`.
  - Determinism: two identical runs ⇒ bit-identical telemetry.
- **Web tests** (`apps/web/tests/`):
  - `verdict.test.ts` — all six outcomes from synthetic summaries; priority ordering
    (RUD beats missed-pad, etc.).
  - `worldToScreen` / camera-scale — pure-math unit tests.
  - `usePlayback` — interpolation correctness; warp changes don't skip frames; scrub
    lands on exact frames.
  - Smoke test: `LandingSimView` renders in setup mode (jsdom, worker mocked).

## 9. Build order

1. `entryDescentGuidance` + validation tests — headless, no rendering.
2. Worker (`run`) + `usePlayback` + HUD wired to real numbers — un-animated data path.
3. Static canvas skeleton (rocket/ground/pad fixed) → then camera zoom + motion.
4. EntryPointSelector with capture grid (`capture` message).
5. Flame/polish, verdict banner.
6. Distinct failure-mode visuals.
7. *(Stretch, explicitly deferred)*: two-pane view; scrub-bar replay UI beyond basic seek.

## 10. Constraints (unchanged from the prompt)

- No modifications to equations of motion, integrator, or atmosphere models in
  `packages/physics-core`, `packages/atmosphere-models`, `packages/rocket-sim` dynamics.
- No second PID controller or second suicide-burn formula.
- No hardcoding of values that belong in the config schema.
- Physics timestep fixed (`dt = 0.01 s`) and — by construction of the playback
  architecture — fully decoupled from render timing; runs are bit-reproducible.
- Existing aerospace sign/color conventions throughout.
