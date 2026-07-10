# Phase 9 slice 2 — Recovery + richer components: design

**Status:** approved 2026-07-10 (brainstormed with the user; scope, depth, and architecture locked below).
**Depends on:** Phase 9 slice 1 (walking skeleton, branch `phase-9-design-studio`) merged.

## Context

Slice 1 derisked the whole `design → generate → fly` pipeline: `packages/rocket-design` builds
mass/Barrowman/drag/aero-table/`RocketConfig` artifacts from a parametric part list, and the studio
UI (tree · inspector · schematic · motor picker · Fly it) flies them in the **untouched** 6-DOF core,
validated against OpenRocket's Alpha III. But the flight ends at apogee, rockets are single-diameter,
and only two nose shapes exist.

Slice 2 (user-locked 2026-07-10) centers on **recovery + full flight** and **component-model
breadth**:

- **Full 9c recovery depth:** parachutes as real parts in the tree (packed mass + CD·S),
  deployment events (apogee / altitude-AGL / timer), drogue → main staging, descent to touchdown
  with descent-rate readout.
- **Full nose-shape family:** conical, ogive, parabolic, power-series, Haack.
- **Transitions/couplers:** conical diameter changes (incl. boat-tails), unlocking multi-diameter
  rockets.
- **Descent architecture:** a pure-TS descent integrator in `packages/rocket-design` — the core sim
  stays byte-identical and still flies only the ascent.

**Explicitly out of slice 2** (later slices): freeform fins, transonic drag corrections, `.rse`
parser + big motor snapshot + live ThrustCurve search, YAML import/export, worker offload of Fly it,
launch lugs/rail guides, inner tubes/motor mounts, undo/redo.

## 1. Component model additions (`packages/rocket-design`)

### 1.1 Nose family

Extend `NoseCone.shape` to `'cone' | 'ogive' | 'parabolic' | 'power' | 'haack'`:

- `power` adds `exponentN` (0 < n ≤ 1; n=0.5 is the classic ½-power).
- `haack` adds `haackC` (default 0 = LD-Haack / Von Kármán; ⅓ = LV-Haack).
- Existing designs (localStorage + ALPHA_III preset) remain valid — no new required fields on the
  existing shapes.

Per shape, three formula sites (all from the OpenRocket technical documentation, cited inline):

- `massModel.ts`: shell volume + CG station by shape (replaces the current two-shape handling).
- `barrowman.ts`: CNα = 2 for every nose (shape-independent); CP station per shape from the
  techdoc table (cone 2/3·L, ogive ≈0.466·L, parabolic 1/2·L, power n·L-based expression,
  Haack per its integral — use the techdoc closed forms).
- `drag.ts`: nose pressure-drag coefficient by shape (the current shape-keyed term extended).

### 1.2 Transition part

New part kind:

```ts
{ kind: 'transition'; lengthM: number; foreRadiusM: number; aftRadiusM: number; material: MaterialId }
```

- Mass/CG/inertia: conical frustum shell (same wall-thickness convention as body tubes).
- Barrowman: transition CNα term `2·(r_aft² − r_fore²)/r_ref²`, CP per the techdoc transition
  expression. Works for both expanding transitions and boat-tails (negative CNα when narrowing).
- Drag: boat-tail/flare pressure-drag term per techdoc.
- `partStations`/schematic: drawn as a trapezoid spanning fore→aft radii; inspector gets a form
  (length, fore/aft radius, material); tree toolbar gets an "add transition" button.
- Reference radius/area conventions: `refRadiusM` stays the max body radius encountered
  (buildConfig geometry updated to account for multi-diameter stacks).

### 1.3 Recovery parts

New part kind (multiple allowed per design):

```ts
{ kind: 'parachute'; cdSM2: number; packedMassKg: number; role: 'drogue' | 'main';
  deployAt: { type: 'apogee' } | { type: 'altitude'; altitudeM: number } | { type: 'timer'; delayS: number } }
```

- During **ascent** (and in `massModel`): a point mass `packedMassKg` at its station — identical
  treatment to the existing `mass` part.
- During **descent**: a drag source `CD·S = cdSM2` once deployed (see §2). Timer events measure
  from apogee; altitude events fire when descending through `altitudeM` AGL.
- Typical flow: drogue `deployAt apogee`, main `deployAt altitude 150 m`. A single-chute design
  (main at apogee) must also work — role only labels the Stats/legend, it does not gate deployment.

## 2. Descent integrator (`packages/rocket-design/src/descent.ts`)

Pure TS, no DOM, no core-sim changes.

- **Input:** apogee state extracted from the ascent run's telemetry (altitude, horizontal
  position/velocity at `summary.apogeeTime`), total descent mass = the design's dry mass (which
  already includes packed-chute masses; propellant fully consumed at burnout), the design's
  parachute list, body reference area + a fixed body descent CD.
- **Integration:** 1-DOF vertical (gravity + drag from body + sum of deployed chutes'
  CD·S · ½ρv²), horizontal position advanced ballistically from the apogee horizontal velocity
  (wind coupling arrives in Phase 10). Semi-implicit Euler at fixed dt = 0.01 s (terminal-velocity
  dominated — stiff-free; RK4 unnecessary), atmosphere density from the same model the aero table
  assumes (`@fds/physics-core` standard atmosphere).
- **Events:** each step, evaluate every not-yet-deployed chute's `deployAt` (apogee → t=0 of
  descent; timer → t ≥ delayS; altitude → crossing altitudeM downward). Deployment is
  instantaneous (opening-shock modeling deferred).
- **Output:** `{ touchdownTimeS, descentRateMps (at touchdown), events: {t, label}[], series: {t, altitudeM, speedMps}[] }`
  with `t` continuing the ascent clock.
- `fly()` concatenates ascent + descent into one `FlightResult`; existing fields keep their
  meaning; new fields: `flightTimeS`, `descentRateMps`, `events`.

## 3. UI (`apps/web/src/features/design-studio/`)

- **Tree/inspector/schematic:** support the two new kinds — add buttons, per-kind inspector forms
  (Select for shape/role/deploy-type, NumberFields for the rest), schematic trapezoid for
  transitions (chutes render as a station tick, not geometry).
- **Fly it:** the TimeChart shows the full flight (ascent + descent) with vertical event markers at
  each deployment; Stats add flight time and descent rate at touchdown; existing apogee/Mach/G
  Stats unchanged.
- **Persistence:** the localStorage shape-check must accept old saved designs (new kinds are
  additive; no migration needed beyond the existing parts-array validation).

## 4. Validation

Same culture as slice 1 — every formula anchored to a hand-computed or published oracle:

- **Unit:** per-shape nose volume/CG/CP/drag vs hand-computed techdoc values; transition
  CNα/CP/mass vs hand-computed frustum values; descent integrator vs the closed-form terminal
  velocity `v_t = √(2mg/(ρ·ΣCD·S))` (must converge to it within 1%) and an exact two-phase
  drogue→main staging scenario.
- **Cross-check:** Alpha III with its stock 12″ chute — descent rate vs OpenRocket's value for the
  same CD·S (oracle value + tolerance recorded in the test, target ±10%); one two-diameter
  reference rocket — CP + margin vs OpenRocket within ±10%. The implementation plan MUST name the
  specific rocket and record its oracle numbers (pick a boat-tail or payload-flare example from the
  techdoc/OpenRocket example set during planning).
- **Core untouched:** `git diff` on `packages/rocket-sim`/`packages/physics-core` empty by
  construction; golden runs stay green (`npm run test`).
- **Front-end:** `npm run test:web` + `npm run build:web` green; manual walkthrough — build a
  boat-tailed two-chute rocket, fly it, watch drogue + main markers and a sane touchdown rate.

## 5. Working model

Same as slice 1: new branch off main after slice 1 merges (e.g. `phase-9-slice-2-recovery`),
subagent-driven per-task TDD + review, commits authored roasteduck04 (no trailers), core packages
read-only, push per task landed.
