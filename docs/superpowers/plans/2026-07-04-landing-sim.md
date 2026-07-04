# Landing Sim (D · Landing tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `D · Landing` web-app tab: the user drags an entry point (altitude/velocity) on a capture-region plot, hits Launch, and watches the rocket fly itself from tens of km down to a pad landing (or a distinct visible failure), with a live telemetry HUD and time-warp playback.

**Architecture:** Precompute-then-playback (spec §3). A worker runs the whole descent headless via a new `entryDescentGuidance` phase machine (coast → retrograde entry burn → delegate to the validated `poweredDescentGuidance`), returns the full telemetry array, and the UI plays it back through a rAF clock with interpolation, canvas rendering with a continuous dynamic-zoom camera, and a pure verdict classifier.

**Tech Stack:** TypeScript, React 19, Vite 7, vitest 3, Canvas 2D, Web Workers. Monorepo npm workspaces; packages resolve from TS source via aliases.

**Spec:** `docs/superpowers/specs/2026-07-04-landing-sim-design.md` — read it first.

## Global Constraints

- Do NOT modify equations of motion, integrator, or atmosphere models (`packages/physics-core`, `packages/atmosphere-models`, `packages/rocket-sim` dynamics files: `deriv.ts`, `state.ts`, `aero.ts`, `massProperties.ts`, `propulsion.ts`, `tvc.ts`, `sim.ts` core loop).
- Do NOT add a second PID controller or a second suicide-burn ignition formula — reuse `AttitudeController` and `poweredDescentGuidance`.
- No hardcoded values that belong in config: entry-burn params, pad radius, tilt limit, RUD threshold all come from the §8.1 YAML schema.
- Physics timestep fixed `dt = 0.01 s` for real runs; SI units + radians everywhere below the UI display layer (`unitsDisplay.ts` converts at the boundary only).
- Follow existing conventions: NED frame (z down, altitude = −r.z), nose-up θ ≈ π/2, palette tokens from `apps/web/src/lib/palette.ts`, CSS classes from `apps/web/src/styles.css`.
- **Commits: author is the user only (git user is already configured). Do NOT add `Co-Authored-By: Claude` or `Claude-Session` trailers — the repo owner requires sole authorship.**
- Run commands from repo root `C:\1NGWZ\1NGWZ\1-NTU\Projects\rocket-sim` unless stated.
- Package tests: `npm test -- tests/validation/entry-descent.test.ts`. Web tests: `npm run test -w web`. Typecheck+build: `npm run build:web`.

---

### Task 1: Config schema — entry burn + pad/verdict fields

**Files:**
- Modify: `packages/rocket-sim/src/types.ts` (add `EntryBurnConfig`; extend `DescentGuidanceConfig`, `LandingTarget`)
- Modify: `packages/rocket-sim/src/loader.ts` (parse the new fields with defaults)
- Modify: `data/reference-tvc-booster.rocket.yaml` (add the new blocks)
- Test: `tests/validation/entry-descent.test.ts` (new file, config-parsing describe)

**Interfaces:**
- Consumes: existing `loadRocketYaml(yamlText, tables)`, `degToRad`.
- Produces: `EntryBurnConfig { igniteAltitudeM: number; targetSpeedMps: number }`; `DescentGuidanceConfig.entryBurn?: EntryBurnConfig`; `LandingTarget.padRadiusM?: number`, `LandingTarget.touchdownTiltMaxRad?: number`, `LandingTarget.rudImpactSpeedMps?: number` (optional in the type; the loader ALWAYS fills them, so loaded configs always carry them — optional only so existing hand-built test fixtures keep compiling).

- [ ] **Step 1: Write the failing test**

Create `tests/validation/entry-descent.test.ts`:

```ts
/**
 * Landing-sim feature (docs/superpowers/specs/2026-07-04-landing-sim-design.md):
 * entry-burn config schema, the entryDescent guidance phase machine, and the
 * §10.2.4-style convergence sweep extended to high-altitude entries.
 */
import { describe, it, expect } from 'vitest';
import { loadAeroTable, loadRocketYaml, loadThrustCurve } from '@fds/rocket-sim';

const THRUST_CSV = '0,210000\n150,210000';
const AERO_CSV =
  'Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr\n0,0,0,0,0,0,0,0,0,0,0\n0,10,0,0,0,0,0,0,0,0,0\n5,0,0,0,0,0,0,0,0,0,0\n5,10,0,0,0,0,0,0,0,0,0';

const YAML = `
name: "Entry Test Booster"
mass:
  dry_kg: 2200
  propellant_kg: 8800
  dry_cg_from_nose_m: 6.1
  propellant_cg_from_nose_m: 4.8
  tank_bottom_from_nose_m: 8.8
  tank_radius_m: 0.6
  dry_inertia_kgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 }
geometry:
  length_m: 12.0
  diameter_m: 1.2
  ref_area_m2: 1.131
propulsion:
  thrust_curve_file: "unused"
  isp_sea_level_s: 282
  isp_vacuum_s: 311
  gimbal: { max_deflection_deg: 6.0, max_slew_rate_dps: 20, position_from_nose_m: 11.8 }
  throttle: { min: 0.4, max: 1.0 }
aero:
  table_file: "unused"
  cp_from_nose_m: 5.4
control:
  pid_pitch: { kp: 0.8, ki: 0.05, kd: 0.6 }
  pid_yaw:   { kp: 0.8, ki: 0.05, kd: 0.6 }
  landing_target:
    touchdown_vz_max_mps: 2.0
    pad_radius_m: 20
    touchdown_tilt_max_deg: 4.0
    rud_impact_speed_mps: 30
  descent:
    rated_thrust_n: 80000
    ignition_margin: 0.3
    touchdown_speed_mps: 1.0
    max_tilt_deg: 8.0
    pid_vz:  { kp: 0.15, ki: 0.05, kd: 0.0 }
    pid_pos: { kp: 0.004, ki: 0.0, kd: 0.03 }
    entry_burn:
      ignite_altitude_m: 12000
      target_speed_mps: 150
`;

describe('entry-burn config schema', () => {
  it('parses entry_burn and the pad/verdict fields', () => {
    const cfg = loadRocketYaml(YAML, { thrustCurveCsv: THRUST_CSV, aeroTableCsv: AERO_CSV });
    expect(cfg.control?.descent?.entryBurn).toEqual({
      igniteAltitudeM: 12000,
      targetSpeedMps: 150,
    });
    expect(cfg.control?.landingTarget?.padRadiusM).toBe(20);
    expect(cfg.control?.landingTarget?.touchdownTiltMaxRad).toBeCloseTo((4 * Math.PI) / 180, 10);
    expect(cfg.control?.landingTarget?.rudImpactSpeedMps).toBe(30);
  });

  it('defaults pad/verdict fields and omits entryBurn when absent', () => {
    const noExtras = YAML
      .replace(/\n    entry_burn:[\s\S]*?target_speed_mps: 150\n/, '\n')
      .replace('pad_radius_m: 20\n    touchdown_tilt_max_deg: 4.0\n    rud_impact_speed_mps: 30\n', '');
    const cfg = loadRocketYaml(noExtras, { thrustCurveCsv: THRUST_CSV, aeroTableCsv: AERO_CSV });
    expect(cfg.control?.descent?.entryBurn).toBeUndefined();
    expect(cfg.control?.landingTarget?.padRadiusM).toBe(15);
    expect(cfg.control?.landingTarget?.touchdownTiltMaxRad).toBeCloseTo((5 * Math.PI) / 180, 10);
    expect(cfg.control?.landingTarget?.rudImpactSpeedMps).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/validation/entry-descent.test.ts`
Expected: FAIL — `entryBurn` is `undefined` (loader doesn't parse it yet) and `padRadiusM` is `undefined`.

- [ ] **Step 3: Extend the types**

In `packages/rocket-sim/src/types.ts`, immediately BEFORE `DescentGuidanceConfig`, add:

```ts
/**
 * Retrograde entry-burn parameters (landing-sim spec §4). Optional: when the
 * block is absent the entry-descent guidance skips straight from coast to the
 * Phase-4 powered descent.
 */
export interface EntryBurnConfig {
  /** Begin the retrograde burn when altitude first drops below this AGL, m. */
  igniteAltitudeM: number;
  /** Cut the engine once airspeed falls below this, m/s. */
  targetSpeedMps: number;
}
```

In `DescentGuidanceConfig`, after the `pidPos` field, add:

```ts
  /** Optional retrograde entry burn (landing-sim spec §4). */
  entryBurn?: EntryBurnConfig;
```

In `LandingTarget`, after `touchdownVzMaxMps`, add:

```ts
  /**
   * Landing-pad radius for the missed-pad verdict, m (landing-sim spec §7).
   * Optional in the type so hand-built test fixtures keep compiling; the YAML
   * loader always fills it (default 15).
   */
  padRadiusM?: number;
  /** Touchdown tilt limit for the tip-over verdict, rad (loader default 5°). */
  touchdownTiltMaxRad?: number;
  /** Impact speed above which touchdown is a RUD, m/s (loader default 25). */
  rudImpactSpeedMps?: number;
```

- [ ] **Step 4: Extend the loader**

In `packages/rocket-sim/src/loader.ts`:

Add `EntryBurnConfig` to the type-only import from `./types.js`.

Inside the `if (controlD['descent'] !== undefined)` block, after computing `pidPos` (i.e. just before the closing `};` of the `descent = {...}` literal), change the literal to parse `entry_burn` first:

```ts
    let descent: DescentGuidanceConfig | undefined;
    if (controlD['descent'] !== undefined) {
      const dD = asObject(controlD['descent'], 'control.descent');
      let entryBurn: EntryBurnConfig | undefined;
      if (dD['entry_burn'] !== undefined) {
        const eD = asObject(dD['entry_burn'], 'control.descent.entry_burn');
        entryBurn = {
          igniteAltitudeM: req(eD, 'ignite_altitude_m', 'control.descent.entry_burn'),
          targetSpeedMps: req(eD, 'target_speed_mps', 'control.descent.entry_burn'),
        };
      }
      descent = {
        ratedThrustN: req(dD, 'rated_thrust_n', 'control.descent'),
        ignitionMargin: opt(dD, 'ignition_margin', 0.3),
        touchdownSpeedMps: opt(dD, 'touchdown_speed_mps', 1.0),
        maxTiltRad: degToRad(opt(dD, 'max_tilt_deg', 8)),
        pidVz: pid(dD, 'pid_vz', 'control.descent'),
        pidPos: pid(dD, 'pid_pos', 'control.descent'),
        entryBurn,
      };
    }
```

In the `landingTarget = {...}` literal, after `touchdownVzMaxMps`, add:

```ts
        padRadiusM: opt(tD, 'pad_radius_m', 15),
        touchdownTiltMaxRad: degToRad(opt(tD, 'touchdown_tilt_max_deg', 5)),
        rudImpactSpeedMps: opt(tD, 'rud_impact_speed_mps', 25),
```

- [ ] **Step 5: Update the reference YAML**

In `data/reference-tvc-booster.rocket.yaml`, replace the `landing_target` line with:

```yaml
  landing_target:
    lat: 0.0
    lon: 0.0
    touchdown_vz_max_mps: 2.0
    pad_radius_m: 15          # missed-pad verdict radius (landing-sim spec §7)
    touchdown_tilt_max_deg: 5.0
    rud_impact_speed_mps: 25
```

and at the END of the `descent:` block (after `pid_pos`), add:

```yaml
    entry_burn:                  # retrograde entry burn (landing-sim spec §4)
      ignite_altitude_m: 12000
      target_speed_mps: 300
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/validation/entry-descent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite to prove nothing broke**

Run: `npm test`
Expected: all 318+ tests PASS (the new fields are optional; `runLandingSim`/PDG fixtures untouched).

- [ ] **Step 8: Commit**

```bash
git add packages/rocket-sim/src/types.ts packages/rocket-sim/src/loader.ts data/reference-tvc-booster.rocket.yaml tests/validation/entry-descent.test.ts
git commit -m "feat(rocket-sim): entry-burn + pad/verdict config schema for the landing sim"
```

---

### Task 2: `entryDescentGuidance` phase machine

**Files:**
- Create: `packages/rocket-sim/src/guidance/entryDescent.ts`
- Modify: `packages/rocket-sim/src/index.ts` (add export)
- Test: `tests/validation/entry-descent.test.ts` (add describe)

**Interfaces:**
- Consumes: `AttitudeController` (`updateDirection(dir: Vec3, s: RocketState, dt: number) → {deltaP, deltaY}`), `poweredDescentGuidance(cfg) → DescentGuidance` (`.ignitionTime`, `.command(t, s)`), physics-core `rotateBodyToNED`, `vnorm`, `vnormalize`, `vscale`.
- Produces:
  - `type EntryDescentPhase = 'coast' | 'entryBurn' | 'descent'`
  - `entryDescentGuidance(cfg: RocketConfig): EntryDescentGuidance` where `EntryDescentGuidance extends GuidanceMode` with readonly `phase: EntryDescentPhase`, `entryBurnIgnitionTime: number | null`, `entryBurnCutoffTime: number | null`, `landingIgnitionTime: number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/validation/entry-descent.test.ts`. First add shared fixtures below the YAML describe (module level):

```ts
import {
  entryDescentGuidance,
  initialEntryState,
  runEntryDescentSim,
} from '@fds/rocket-sim';
import type { EntryScenario, RocketConfig } from '@fds/rocket-sim';

// Zero-coefficient aero table: isolates guidance + propulsion + gravity,
// following the §10.2.4 precedent (tail-first flight is outside the shipped
// Barrowman table's AoA validity — see rocket-landing.test.ts header).
const zeroAero = loadAeroTable(AERO_CSV);

/** 80 kN landing engine: comfortable T/W ≈ 1.9 at the 4200 kg entry mass. */
const CFG: RocketConfig = loadRocketYaml(YAML, {
  thrustCurveCsv: THRUST_CSV,
  aeroTableCsv: AERO_CSV,
});
CFG.aero = { table: zeroAero, cpFromNoseM: 5.4 };

const ENTRY: EntryScenario = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-80 * Math.PI) / 180,
  downrangeM: 500,
  propellantKg: 2000,
};
```

(Note: `loadRocketYaml` already returns a zero-aero config here because AERO_CSV is the zero table — the explicit `CFG.aero` reassignment is belt-and-braces documentation; keep it.)

Then the phase-machine describe:

```ts
describe('entryDescentGuidance phase machine', () => {
  it('coasts (throttle 0) above the ignite altitude', () => {
    const g = entryDescentGuidance(CFG);
    const s = initialEntryState(CFG, { ...ENTRY, altitudeM: 15000 });
    const cmd = g.command(0, s);
    expect(g.phase).toBe('coast');
    expect(cmd.throttle).toBe(0);
    expect(cmd.deltaP).toBe(0);
    expect(g.entryBurnIgnitionTime).toBeNull();
  });

  it('ignites retrograde at full throttle below the ignite altitude', () => {
    const g = entryDescentGuidance(CFG);
    g.command(0, initialEntryState(CFG, { ...ENTRY, altitudeM: 15000 }));
    const cmd = g.command(0.01, initialEntryState(CFG, { ...ENTRY, altitudeM: 11900 }));
    expect(g.phase).toBe('entryBurn');
    expect(g.entryBurnIgnitionTime).toBe(0.01);
    expect(cmd.throttle).toBe(CFG.propulsion.throttle.max);
  });

  it('cuts off below the target speed and delegates to powered descent', () => {
    const g = entryDescentGuidance(CFG);
    g.command(0, initialEntryState(CFG, { ...ENTRY, altitudeM: 11900 }));
    // Same altitude, speed now below the 150 m/s target → cutoff + delegation.
    const slow = initialEntryState(CFG, { ...ENTRY, altitudeM: 11000, speedMps: 100 });
    g.command(0.01, slow);
    expect(g.phase).toBe('descent');
    expect(g.entryBurnCutoffTime).toBe(0.01);
  });

  it('skips straight to descent when entry_burn is absent (graceful degradation)', () => {
    const noBurn: RocketConfig = {
      ...CFG,
      control: {
        ...CFG.control!,
        descent: { ...CFG.control!.descent!, entryBurn: undefined },
      },
    };
    const g = entryDescentGuidance(noBurn);
    expect(g.phase).toBe('descent');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/validation/entry-descent.test.ts`
Expected: FAIL — `entryDescentGuidance` / `initialEntryState` are not exported (module doesn't exist).

- [ ] **Step 3: Write the guidance module**

Create `packages/rocket-sim/src/guidance/entryDescent.ts` (the sim-runner half comes in Task 3 — write the whole file now, it's one coherent unit; Task 3 only adds tests):

```ts
/**
 * Entry-descent scenario (landing-sim spec §4, docs/superpowers/specs/
 * 2026-07-04-landing-sim-design.md): a high-altitude entry flown as
 *
 *  1. **coast** — engine off, gimbal zero (no thrust ⇒ no TVC authority,
 *     same convention as `landing.ts`); ballistic fall with real drag.
 *  2. **entryBurn** — below `entry_burn.ignite_altitude_m`, thrust axis held
 *     RETROGRADE (along −velocity via the shared direction-vector attitude
 *     controller, the same mechanism `boostback.ts` uses) at full throttle,
 *     until airspeed < `entry_burn.target_speed_mps` → engine cut.
 *  3. **descent** — every subsequent command delegates to the validated
 *     Phase-4 `poweredDescentGuidance` (its own coast → suicide-burn
 *     ignition → touchdown; no duplicated formulas).
 *
 * Config absent the `entry_burn` block degrades to plain powered descent.
 * All parameters come from the §8.1 config; nothing is hardcoded.
 */

import {
  qfromEuler321,
  rotateBodyToNED,
  rotateNEDtoBody,
  vnorm,
  vnormalize,
  vscale,
  type Vec3,
} from '@fds/physics-core';
import { AttitudeController } from '../control/attitudeControl.js';
import type { GuidanceMode } from '../guidance.js';
import type { GimbalCommand, RocketConfig, RocketState } from '../types.js';
import { poweredDescentGuidance } from './landing.js';
import {
  attachLandingMetrics,
  runRocketSim,
  type LandingRunOptions,
  type RunResult,
} from '../sim.js';

export type EntryDescentPhase = 'coast' | 'entryBurn' | 'descent';

/** Entry-descent guidance with its phase machine exposed for telemetry/tests. */
export interface EntryDescentGuidance extends GuidanceMode {
  readonly phase: EntryDescentPhase;
  /** Entry-burn ignition time, s (null while coasting / no entry burn). */
  readonly entryBurnIgnitionTime: number | null;
  /** Entry-burn engine-cut time, s (null until cutoff). */
  readonly entryBurnCutoffTime: number | null;
  /** Landing-burn ignition time from the delegated Phase-4 guidance. */
  readonly landingIgnitionTime: number | null;
}

/** Build the coast → entry-burn → powered-descent guidance (module header). */
export const entryDescentGuidance = (cfg: RocketConfig): EntryDescentGuidance => {
  const control = cfg.control;
  if (!control?.descent) {
    throw new Error(
      'entryDescentGuidance: config has no "control.descent" section (README §8.1)',
    );
  }
  const entryBurn = control.descent.entryBurn;
  const { max: thrMax } = cfg.propulsion.throttle;
  const attitude = new AttitudeController(control, cfg.propulsion.gimbal);
  const landing = poweredDescentGuidance(cfg);

  let phase: EntryDescentPhase = entryBurn ? 'coast' : 'descent';
  let ignitionTime: number | null = null;
  let cutoffTime: number | null = null;
  let lastT: number | null = null;

  return {
    get phase(): EntryDescentPhase {
      return phase;
    },
    get entryBurnIgnitionTime(): number | null {
      return ignitionTime;
    },
    get entryBurnCutoffTime(): number | null {
      return cutoffTime;
    },
    get landingIgnitionTime(): number | null {
      return landing.ignitionTime;
    },

    command(t: number, s: RocketState): GimbalCommand {
      if (phase === 'descent') return landing.command(t, s);
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      const h = -s.r.z;
      const vNED = rotateBodyToNED(s.q, s.v);

      if (phase === 'coast') {
        if (h > entryBurn!.igniteAltitudeM) {
          return { deltaP: 0, deltaY: 0, throttle: 0 }; // ballistic, no authority
        }
        phase = 'entryBurn';
        ignitionTime = t;
      }

      // Entry burn: retrograde full throttle until below the target speed.
      if (vnorm(vNED) <= entryBurn!.targetSpeedMps) {
        phase = 'descent';
        cutoffTime = t;
        return landing.command(t, s);
      }
      const dir = vnormalize(vscale(vNED, -1));
      const act = attitude.updateDirection(dir, s, dt);
      return { deltaP: act.deltaP, deltaY: act.deltaY, throttle: thrMax };
    },
  };
};

// ---------------------------------------------------------------------------
// Scenario runner (landing-sim spec §4 "entry state construction")
// ---------------------------------------------------------------------------

/** User-settable entry point for a landing-sim run. */
export interface EntryScenario {
  /** Entry altitude AGL, m. */
  altitudeM: number;
  /** Entry speed |V|, m/s. */
  speedMps: number;
  /** Flight-path angle, rad (negative = descending; −π/2 = straight down). */
  gammaRad: number;
  /** Downrange offset from the pad, m (starts south of it, flying north). */
  downrangeM: number;
  /** Propellant remaining at entry, kg. */
  propellantKg: number;
}

/** Retrograde (engine-first), descending initial state at the entry point. */
export const initialEntryState = (cfg: RocketConfig, sc: EntryScenario): RocketState => {
  // v_NED in the north–down plane from |V| and γ (γ<0 ⇒ v_z = −V·sinγ > 0, down).
  const vNED: Vec3 = {
    x: sc.speedMps * Math.cos(sc.gammaRad),
    y: 0,
    z: -sc.speedMps * Math.sin(sc.gammaRad),
  };
  // Nose along −v̂ (retrograde): body X in NED is (cosθ, 0, −sinθ) at φ=ψ=0,
  // and θ = π + γ gives (−cosγ, 0, sinγ) = −v̂ exactly.
  const q = qfromEuler321(0, Math.PI + sc.gammaRad, 0);
  return {
    r: { x: -sc.downrangeM, y: 0, z: -sc.altitudeM },
    v: rotateNEDtoBody(q, vNED),
    q,
    omega: { x: 0, y: 0, z: 0 },
    mass: cfg.mass.dryKg + sc.propellantKg,
  };
};

/** Result bundle: the run plus the phase-machine timestamps. */
export interface EntryDescentRunResult {
  result: RunResult;
  entryBurnIgnitionTime: number | null;
  entryBurnCutoffTime: number | null;
  landingIgnitionTime: number | null;
}

/**
 * Run the full entry → landing sequence with the constant-rating landing
 * engine (same thrust-curve swap as `runLandingSim` / plan A7).
 */
export const runEntryDescentSim = (
  cfg: RocketConfig,
  scenario: EntryScenario,
  opts: LandingRunOptions = {},
): EntryDescentRunResult => {
  const descent = cfg.control?.descent;
  if (!descent) {
    throw new Error('runEntryDescentSim: config has no "control.descent" section');
  }
  const maxTime = opts.maxTime ?? 600;
  const landingCfg: RocketConfig = {
    ...cfg,
    propulsion: {
      ...cfg.propulsion,
      thrustCurve: {
        time: [0, maxTime + 1],
        thrust: [descent.ratedThrustN, descent.ratedThrustN],
      },
    },
  };
  const guidance = entryDescentGuidance(landingCfg);
  const initialState = initialEntryState(cfg, scenario);
  const result = runRocketSim(landingCfg, guidance, {
    ...opts,
    maxTime,
    initialState,
    groundConstraint: true,
  });
  attachLandingMetrics(result, cfg, initialState.mass, guidance.landingIgnitionTime);
  return {
    result,
    entryBurnIgnitionTime: guidance.entryBurnIgnitionTime,
    entryBurnCutoffTime: guidance.entryBurnCutoffTime,
    landingIgnitionTime: guidance.landingIgnitionTime,
  };
};
```

- [ ] **Step 4: Export it**

In `packages/rocket-sim/src/index.ts`, after the `./guidance/boostback.js` line, add:

```ts
export * from './guidance/entryDescent.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/validation/entry-descent.test.ts`
Expected: PASS (6 tests: 2 config + 4 phase machine).

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-sim/src/guidance/entryDescent.ts packages/rocket-sim/src/index.ts tests/validation/entry-descent.test.ts
git commit -m "feat(rocket-sim): entryDescentGuidance — coast/entry-burn/descent phase machine"
```

---

### Task 3: Entry-descent validation sweep

**Files:**
- Test: `tests/validation/entry-descent.test.ts` (add two describes; no source changes — the runner exists from Task 2)

**Interfaces:**
- Consumes: `runEntryDescentSim(CFG, ENTRY, opts) → EntryDescentRunResult` from Task 2.
- Produces: confidence that the guidance lands across the entry envelope; the worker (Task 5) can trust it.

- [ ] **Step 1: Write the sweep + effectiveness + determinism tests**

Append to `tests/validation/entry-descent.test.ts`:

```ts
describe('entry-descent landing convergence (spec §8)', () => {
  // Inside the capture region for the 80 kN test engine at these masses; the
  // envelope brackets the UI's default ranges (spec §8: "the Section-10
  // convergence pattern, extended to this feature's entry ranges").
  const sweep: Array<EntryScenario & { label: string }> = [
    { label: 'reference entry', ...ENTRY },
    { label: 'lower & slower', ...ENTRY, altitudeM: 10000, speedMps: 300 },
    { label: 'higher & faster', ...ENTRY, altitudeM: 18000, speedMps: 500 },
    { label: 'steep', ...ENTRY, gammaRad: (-88 * Math.PI) / 180 },
    { label: 'offset 2 km', ...ENTRY, downrangeM: 2000 },
  ];
  const vzMax = CFG.control!.landingTarget!.touchdownVzMaxMps;

  for (const sc of sweep) {
    it(`lands within the touchdown limit — ${sc.label}`, () => {
      const { result, entryBurnIgnitionTime, landingIgnitionTime } =
        runEntryDescentSim(CFG, sc, { sampleEvery: 100 });
      const landing = result.summary.landing!;
      expect(landing.touchedDown).toBe(true);
      expect(entryBurnIgnitionTime).not.toBeNull();
      expect(landingIgnitionTime).not.toBeNull();
      expect(Math.abs(landing.touchdownVz)).toBeLessThanOrEqual(vzMax);
      expect(landing.missDistance).toBeLessThan(100);
      expect(result.finalState.mass).toBeGreaterThan(CFG.mass.dryKg); // propellant left
    });
  }
});

describe('entry-burn effectiveness + determinism (spec §8)', () => {
  it('lowers peak dynamic pressure vs the same entry without the burn', () => {
    const withBurn = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 100 });
    const noBurnCfg: RocketConfig = {
      ...CFG,
      control: {
        ...CFG.control!,
        descent: { ...CFG.control!.descent!, entryBurn: undefined },
      },
    };
    const withoutBurn = runEntryDescentSim(noBurnCfg, ENTRY, { sampleEvery: 100 });
    expect(withBurn.result.summary.maxQbar).toBeLessThan(withoutBurn.result.summary.maxQbar);
  });

  it('is bit-reproducible: two identical runs produce identical telemetry', () => {
    const a = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 50 });
    const b = runEntryDescentSim(CFG, ENTRY, { sampleEvery: 50 });
    expect(JSON.stringify(a.result.telemetry)).toBe(JSON.stringify(b.result.telemetry));
    expect(a.entryBurnIgnitionTime).toBe(b.entryBurnIgnitionTime);
    expect(a.entryBurnCutoffTime).toBe(b.entryBurnCutoffTime);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- tests/validation/entry-descent.test.ts`
Expected: PASS. **If a sweep case fails** (physics is real — the closure math says these cases fit, but PID transients can eat margin): print `result.summary.landing` for the failing case, then adjust IN THIS ORDER until green — (1) raise the test YAML's `target_speed_mps` (150 → 200), (2) raise `ignite_altitude_m` (12000 → 14000), (3) raise the scenario's `propellantKg` (2000 → 2500, keeps T/W = 80 kN / 4.6 t ≈ 1.77 fine). These are test-fixture tunings, not source changes; do NOT touch the guidance to make a scenario pass.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/validation/entry-descent.test.ts
git commit -m "test(rocket-sim): entry-descent convergence sweep, burn effectiveness, determinism"
```

---

### Task 4: Web scaffolding — tab, feature types, skeleton view

**Files:**
- Create: `apps/web/src/features/landing-sim/types.ts`
- Create: `apps/web/src/features/landing-sim/LandingSimView.tsx` (skeleton)
- Modify: `apps/web/src/App.tsx` (4th tab)
- Modify: `apps/web/src/styles.css` (feature layout classes, appended at end)
- Test: `apps/web/tests/smoke.test.tsx` (update tab count, add mount test)

**Interfaces:**
- Consumes: existing `.panel`, `.btn`, `.stat-grid`, `.chip` CSS; `App.tsx` tab router.
- Produces: `ModuleId` gains `'landing'`; `LandingSimView(): JSX.Element` exported from the feature dir; feature types `PhaseLabel`, `VerdictKind`, `Verdict`, `EntryInputs`, `CaptureGrid` (exact shapes below) that Tasks 5–12 import.

- [ ] **Step 1: Update the smoke test (failing first)**

In `apps/web/tests/smoke.test.tsx`, change the 3-tab assertion in "renders the header..." to:

```ts
    expect(
      screen.getAllByRole('button', { name: /· (Rocket|Reentry|Aircraft|Landing)/ }),
    ).toHaveLength(4);
```

and add to the "switches between all three modules" test (before switching back to Rocket):

```ts
    fireEvent.click(screen.getByRole('button', { name: 'D · Landing' }));
    expect(screen.getByText(/Entry point/)).toBeTruthy();
```

Add a new describe at the end of the file:

```ts
describe('module D — landing sim', () => {
  it('mounts in setup mode with the entry-point panel and a Launch button', async () => {
    const { LandingSimView } = await import('../src/features/landing-sim/LandingSimView');
    render(<LandingSimView />);
    expect(screen.getByText(/Entry point/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Launch/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w web`
Expected: FAIL — 3 tabs found, module import fails.

- [ ] **Step 3: Create the feature types**

Create `apps/web/src/features/landing-sim/types.ts`:

```ts
/**
 * Local types for the D · Landing module (landing-sim spec §5). Worker message
 * types live in lib/simWorker.ts with the other module protocols.
 */

export type PhaseLabel = 'FREEFALL' | 'ENTRY BURN' | 'LANDING BURN' | 'TOUCHDOWN';

export type VerdictKind =
  | 'success'
  | 'hard-landing'
  | 'tip-over'
  | 'missed-pad'
  | 'out-of-propellant'
  | 'rud'
  | 'no-touchdown';

export interface Verdict {
  kind: VerdictKind;
  /** One-line human description for the banner. */
  detail: string;
}

/** The four user-settable entry inputs + the fixed propellant load (spec §2). */
export interface EntryInputs {
  altitudeM: number;
  speedMps: number;
  gammaRad: number;
  downrangeM: number;
  propellantKg: number;
}

export type CaptureOutcome = 'lands' | 'misses' | 'crashes';

/** Streaming capture-region grid; cells[iH][iV], null = not yet computed. */
export interface CaptureGrid {
  nV: number;
  nH: number;
  vRange: [number, number];
  hRange: [number, number];
  cells: (CaptureOutcome | null)[][];
  /** True while a fresh sweep streams in (rendered greyed). */
  stale: boolean;
}

/** Phase timestamps returned by the worker with a finished run. */
export interface PhaseTimes {
  entryBurnIgnitionTime: number | null;
  entryBurnCutoffTime: number | null;
  landingIgnitionTime: number | null;
}
```

- [ ] **Step 4: Create the skeleton view**

Create `apps/web/src/features/landing-sim/LandingSimView.tsx`:

```tsx
/**
 * D · Landing (landing-sim spec §5): entry-point setup → cinematic playback.
 * This skeleton mounts the setup panel; Tasks 5–12 fill in the worker, the
 * selector, the canvas, the HUD, and the verdict flow.
 */

import { useState, type JSX } from 'react';
import type { EntryInputs } from './types';

/** UI defaults (SI/radians); the selector edits these (spec §2). */
export const DEFAULT_INPUTS: EntryInputs = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-70 * Math.PI) / 180,
  downrangeM: 3000,
  propellantKg: 1500,
};

export const LandingSimView = (): JSX.Element => {
  const [inputs] = useState<EntryInputs>(DEFAULT_INPUTS);

  return (
    <div className="landing-layout">
      <div className="panel">
        <h2>Entry point</h2>
        <p className="hint">
          Drag the entry state onto the capture region, set γ and downrange, then launch.
        </p>
        <p>
          {(inputs.altitudeM / 1000).toFixed(1)} km · {inputs.speedMps.toFixed(0)} m/s
        </p>
        <div className="btn-row">
          <button type="button" className="btn" disabled>
            Launch
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Add the tab**

In `apps/web/src/App.tsx`:

```tsx
import { LandingSimView } from './features/landing-sim/LandingSimView';
```

```ts
type ModuleId = 'rocket' | 'reentry' | 'aircraft' | 'landing';

const TABS: ReadonlyArray<{ id: ModuleId; label: string }> = [
  { id: 'rocket', label: 'A · Rocket' },
  { id: 'reentry', label: 'B · Reentry' },
  { id: 'aircraft', label: 'C · Aircraft' },
  { id: 'landing', label: 'D · Landing' },
];
```

and in `<main>`:

```tsx
        {active === 'landing' && <LandingSimView />}
```

- [ ] **Step 6: Add layout CSS**

Append to `apps/web/src/styles.css`:

```css
/* --- D · Landing (landing-sim spec §5) ------------------------------------ */
.landing-layout {
  display: grid;
  gap: 16px;
}
.landing-flight {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.landing-canvas-wrap {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
}
.landing-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.landing-controls input[type='range'] {
  flex: 1;
  min-width: 160px;
}
.landing-verdict {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}
```

- [ ] **Step 7: Run web tests**

Run: `npm run test -w web`
Expected: PASS (smoke suite incl. the new module D describe).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/landing-sim/types.ts apps/web/src/features/landing-sim/LandingSimView.tsx apps/web/src/App.tsx apps/web/src/styles.css apps/web/tests/smoke.test.tsx
git commit -m "feat(web): D·Landing tab scaffold — feature types, skeleton view, layout css"
```

---

### Task 5: Worker protocol + `descent.worker.ts`

**Files:**
- Modify: `apps/web/src/lib/simWorker.ts` (Module D protocol + factory)
- Create: `apps/web/src/workers/descent.worker.ts`

**Interfaces:**
- Consumes: `runEntryDescentSim`, `EntryScenario` from `@fds/rocket-sim` (Task 2); `referenceRocket()` from `lib/data`; `CaptureOutcome` from feature types (re-exported through simWorker to avoid a lib→feature import — see below).
- Produces (in `simWorker.ts`):
  - `EntryRunRequest { kind:'entry-run'; scenario: EntryScenario; sampleEvery: number }`
  - `CaptureRequest { kind:'capture'; gammaRad; downrangeM; propellantKg; vRange:[number,number]; hRange:[number,number]; nV; nH }` (all numbers)
  - `type LandingSimRequest = EntryRunRequest | CaptureRequest`
  - `EntryRunResult { kind:'entry-result'; telemetry: TelemetryFrame[]; summary: RunSummary; entryBurnIgnitionTime: number|null; entryBurnCutoffTime: number|null; landingIgnitionTime: number|null }`
  - `CaptureCellMsg { kind:'capture-cell'; iV: number; iH: number; outcome: CaptureOutcome }`, `CaptureDone { kind:'capture-done' }`
  - `type LandingSimResponse = EntryRunResult | CaptureCellMsg | CaptureDone | WorkerFailure`
  - `createLandingSimWorker(): Worker`

There is no worker unit test (repo precedent: `ascent.worker.ts` / `corridor.worker.ts` are untested thin adapters over package functions that ARE tested — Task 3 covers this one's substance). The view test in Task 11 exercises the message flow with a stubbed worker.

- [ ] **Step 1: Note the import direction for `CaptureOutcome`**

`lib/simWorker.ts` must not import from a feature dir (lib is shared). Define `CaptureOutcome` in `simWorker.ts` and change `features/landing-sim/types.ts` to re-export it instead of declaring it:

```ts
// in features/landing-sim/types.ts — REPLACE the local declaration
export type { CaptureOutcome } from '../../lib/simWorker';
```

(TypeScript type-only re-export; no runtime import cycle.)

- [ ] **Step 2: Extend `simWorker.ts`**

In `apps/web/src/lib/simWorker.ts`, extend the rocket-sim type import:

```ts
import type {
  EntryScenario,
  LandingScenario,
  RunSummary,
  TelemetryFrame,
} from '@fds/rocket-sim';
```

Append before the factories section:

```ts
// --- Module D: entry-descent landing sim (landing-sim spec §3) ---------------

export interface EntryRunRequest {
  kind: 'entry-run';
  scenario: EntryScenario;
  /** Record every Nth 0.01 s step (2 ⇒ 50 Hz playback frames). */
  sampleEvery: number;
}

/** Capture-region sweep at fixed γ/downrange/propellant over a v×h grid. */
export interface CaptureRequest {
  kind: 'capture';
  gammaRad: number;
  downrangeM: number;
  propellantKg: number;
  vRange: [number, number];
  hRange: [number, number];
  nV: number;
  nH: number;
}

export type LandingSimRequest = EntryRunRequest | CaptureRequest;

export interface EntryRunResult {
  kind: 'entry-result';
  telemetry: TelemetryFrame[];
  summary: RunSummary;
  entryBurnIgnitionTime: number | null;
  entryBurnCutoffTime: number | null;
  landingIgnitionTime: number | null;
}

export type CaptureOutcome = 'lands' | 'misses' | 'crashes';

/** One capture cell, streamed as soon as its coarse run finishes. */
export interface CaptureCellMsg {
  kind: 'capture-cell';
  iV: number;
  iH: number;
  outcome: CaptureOutcome;
}

export interface CaptureDone {
  kind: 'capture-done';
}

export type LandingSimResponse = EntryRunResult | CaptureCellMsg | CaptureDone | WorkerFailure;
```

And with the factories:

```ts
export const createLandingSimWorker = (): Worker =>
  new Worker(new URL('../workers/descent.worker.ts', import.meta.url), { type: 'module' });
```

- [ ] **Step 3: Create the worker**

Create `apps/web/src/workers/descent.worker.ts`:

```ts
/**
 * Module D batch-run worker (landing-sim spec §3): one full entry-descent run
 * at the real dt = 0.01 s, and the capture-region sweep — coarse dt, sparse
 * sampling, cells streamed one at a time so the selector shades in live
 * (same streaming pattern as corridor.worker.ts).
 */

import { runEntryDescentSim, type EntryScenario } from '@fds/rocket-sim';
import { referenceRocket } from '../lib/data';
import type { CaptureOutcome, LandingSimRequest, LandingSimResponse } from '../lib/simWorker';

const post = (msg: LandingSimResponse): void => (self as unknown as Worker).postMessage(msg);

/** Coarse sweep: dt 0.02 s (PID-safe), summary-only telemetry. */
const SWEEP = { dt: 0.02, sampleEvery: 100000 };

const classify = (scenario: EntryScenario): CaptureOutcome => {
  const cfg = referenceRocket();
  const { result } = runEntryDescentSim(cfg, scenario, SWEEP);
  const landing = result.summary.landing;
  const target = cfg.control?.landingTarget;
  const vzMax = target?.touchdownVzMaxMps ?? 2;
  const padR = target?.padRadiusM ?? 15;
  if (!landing?.touchedDown || Math.abs(landing.touchdownVz) > vzMax) return 'crashes';
  return landing.missDistance <= padR ? 'lands' : 'misses';
};

self.onmessage = (ev: MessageEvent<LandingSimRequest>): void => {
  const req = ev.data;
  try {
    if (req.kind === 'entry-run') {
      const run = runEntryDescentSim(referenceRocket(), req.scenario, {
        sampleEvery: req.sampleEvery,
      });
      post({
        kind: 'entry-result',
        telemetry: run.result.telemetry,
        summary: run.result.summary,
        entryBurnIgnitionTime: run.entryBurnIgnitionTime,
        entryBurnCutoffTime: run.entryBurnCutoffTime,
        landingIgnitionTime: run.landingIgnitionTime,
      });
      return;
    }

    const [vLo, vHi] = req.vRange;
    const [hLo, hHi] = req.hRange;
    for (let iH = 0; iH < req.nH; iH++) {
      for (let iV = 0; iV < req.nV; iV++) {
        const scenario: EntryScenario = {
          altitudeM: hLo + ((hHi - hLo) * iH) / (req.nH - 1),
          speedMps: vLo + ((vHi - vLo) * iV) / (req.nV - 1),
          gammaRad: req.gammaRad,
          downrangeM: req.downrangeM,
          propellantKg: req.propellantKg,
        };
        // A run that throws (degenerate state) counts as a crash cell.
        let outcome: CaptureOutcome = 'crashes';
        try {
          outcome = classify(scenario);
        } catch {
          /* leave 'crashes' */
        }
        post({ kind: 'capture-cell', iV, iH, outcome });
      }
    }
    post({ kind: 'capture-done' });
  } catch (e) {
    post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
```

- [ ] **Step 4: Typecheck via the web build**

Run: `npm run build:web`
Expected: PASS (tsc + vite; the worker is bundled by the `new URL` literal).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/simWorker.ts apps/web/src/workers/descent.worker.ts apps/web/src/features/landing-sim/types.ts
git commit -m "feat(web): landing-sim worker — full entry run + streaming capture sweep"
```

---

### Task 6: Verdict classifier

**Files:**
- Create: `apps/web/src/features/landing-sim/verdict.ts`
- Test: `apps/web/tests/verdict.test.ts`

**Interfaces:**
- Consumes: `LandingSummary`, `TelemetryFrame`, `RocketConfig` types; feature `Verdict`.
- Produces: `tiltFromVertical(theta: number): number` and `classifyLanding(summary: LandingSummary | undefined, finalFrame: TelemetryFrame | undefined, cfg: RocketConfig): Verdict` — Tasks 11–12 consume both.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/verdict.test.ts`:

```ts
/** Verdict priority ladder (landing-sim spec §7): first match wins. */
import { describe, expect, it } from 'vitest';
import type { LandingSummary, TelemetryFrame } from '@fds/rocket-sim';
import { classifyLanding, tiltFromVertical } from '../src/features/landing-sim/verdict';
import { referenceRocket } from '../src/lib/data';

const cfg = referenceRocket(); // vzMax 2, padR 15, tiltMax 5°, rud 25 (Task 1 yaml)

const summary = (over: Partial<LandingSummary>): LandingSummary => ({
  touchedDown: true,
  ignitionTime: 100,
  touchdownVz: 1.0,
  touchdownLateralSpeed: 0.2,
  missDistance: 3,
  touchdownG: 1.2,
  propellantUsedKg: 900,
  ...over,
});

const frame = (over: Partial<TelemetryFrame>): TelemetryFrame => ({
  t: 120,
  r: { x: 0, y: 0, z: 0 },
  v: { x: 0, y: 0, z: 0 },
  speed: 1,
  mach: 0,
  alpha: 0,
  beta: 0,
  qbar: 0,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 }, // perfectly vertical
  omega: { x: 0, y: 0, z: 0 },
  mass: 2800,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0.5,
  altitude: 0,
  ...over,
});

describe('tiltFromVertical', () => {
  it('is 0 nose-up and grows with pitch error', () => {
    expect(tiltFromVertical(Math.PI / 2)).toBeCloseTo(0, 10);
    expect(tiltFromVertical(Math.PI / 2 - 0.1)).toBeCloseTo(0.1, 6);
  });
});

describe('classifyLanding priority ladder', () => {
  it('success when everything is nominal', () => {
    expect(classifyLanding(summary({}), frame({}), cfg).kind).toBe('success');
  });
  it('rud beats every other failure', () => {
    const v = classifyLanding(
      summary({ touchdownVz: 40, missDistance: 500 }),
      frame({ mass: cfg.mass.dryKg }), // also out of propellant
      cfg,
    );
    expect(v.kind).toBe('rud');
  });
  it('out-of-propellant beats hard-landing', () => {
    const v = classifyLanding(summary({ touchdownVz: 10 }), frame({ mass: cfg.mass.dryKg }), cfg);
    expect(v.kind).toBe('out-of-propellant');
  });
  it('hard landing above the vz limit with propellant left', () => {
    expect(classifyLanding(summary({ touchdownVz: 5 }), frame({}), cfg).kind).toBe('hard-landing');
  });
  it('tip-over above the tilt limit', () => {
    const v = classifyLanding(summary({}), frame({ euler: { phi: 0, theta: Math.PI / 2 - 0.2, psi: 0 } }), cfg);
    expect(v.kind).toBe('tip-over'); // 0.2 rad ≈ 11.5° > 5°
  });
  it('missed-pad when soft but outside the radius', () => {
    expect(classifyLanding(summary({ missDistance: 40 }), frame({}), cfg).kind).toBe('missed-pad');
  });
  it('no-touchdown when the time cap was hit', () => {
    expect(classifyLanding(summary({ touchedDown: false }), frame({}), cfg).kind).toBe('no-touchdown');
    expect(classifyLanding(undefined, undefined, cfg).kind).toBe('no-touchdown');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w web -- verdict`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/landing-sim/verdict.ts`:

```ts
/**
 * Pass/fail classifier (landing-sim spec §7). Pure function of the finished
 * run — evaluated once when the worker returns, revealed at touchdown.
 * Priority ladder, first match wins: RUD → out-of-propellant → hard landing →
 * tip-over → missed pad → success. All thresholds from config (Task 1 schema).
 */

import { radToDeg } from '@fds/physics-core';
import type { LandingSummary, RocketConfig, TelemetryFrame } from '@fds/rocket-sim';
import type { Verdict } from './types';

/**
 * Tilt from vertical at pitch θ: body +X in NED has down-component −sinθ
 * (independent of ψ, φ for the tilt cone), so cos(tilt) = sinθ.
 */
export const tiltFromVertical = (theta: number): number =>
  Math.acos(Math.min(1, Math.max(-1, Math.sin(theta))));

export const classifyLanding = (
  summary: LandingSummary | undefined,
  finalFrame: TelemetryFrame | undefined,
  cfg: RocketConfig,
): Verdict => {
  const target = cfg.control?.landingTarget;
  const vzMax = target?.touchdownVzMaxMps ?? 2;
  const padR = target?.padRadiusM ?? 15;
  const tiltMax = target?.touchdownTiltMaxRad ?? (5 * Math.PI) / 180;
  const rudSpeed = target?.rudImpactSpeedMps ?? 25;

  if (!summary || !finalFrame || !summary.touchedDown) {
    return { kind: 'no-touchdown', detail: 'Time cap reached before ground contact.' };
  }

  const impactSpeed = Math.hypot(summary.touchdownVz, summary.touchdownLateralSpeed);
  const outOfProp = finalFrame.mass <= cfg.mass.dryKg + 1e-6;
  const tilt = tiltFromVertical(finalFrame.euler.theta);

  if (impactSpeed > rudSpeed) {
    return {
      kind: 'rud',
      detail: `Impact at ${impactSpeed.toFixed(0)} m/s — rapid unscheduled disassembly.`,
    };
  }
  if (outOfProp && Math.abs(summary.touchdownVz) > vzMax) {
    return {
      kind: 'out-of-propellant',
      detail: 'Tanks ran dry before touchdown velocity was nulled.',
    };
  }
  if (Math.abs(summary.touchdownVz) > vzMax) {
    return {
      kind: 'hard-landing',
      detail: `Touchdown at ${Math.abs(summary.touchdownVz).toFixed(1)} m/s (limit ${vzMax} m/s).`,
    };
  }
  if (tilt > tiltMax) {
    return {
      kind: 'tip-over',
      detail: `Touchdown tilt ${radToDeg(tilt).toFixed(1)}° exceeds the ${radToDeg(tiltMax).toFixed(0)}° limit.`,
    };
  }
  if (summary.missDistance > padR) {
    return {
      kind: 'missed-pad',
      detail: `Soft landing ${summary.missDistance.toFixed(0)} m from the pad (radius ${padR} m).`,
    };
  }
  return { kind: 'success', detail: 'The landing is confirmed.' };
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w web -- verdict`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/landing-sim/verdict.ts apps/web/tests/verdict.test.ts
git commit -m "feat(web): landing verdict classifier with config-driven priority ladder"
```

---

### Task 7: Playback — pure math + hook

**Files:**
- Create: `apps/web/src/features/landing-sim/playbackMath.ts`
- Create: `apps/web/src/features/landing-sim/usePlayback.ts`
- Test: `apps/web/tests/playback.test.ts`

**Interfaces:**
- Consumes: `TelemetryFrame[]`; physics-core `qfromEuler321`, `rotateBodyToNED`, `G0`.
- Produces:
  - `frameIndexAt(frames: TelemetryFrame[], t: number): number`
  - `PlaybackSample { t, northM, eastM, altitudeM, vNED: Vec3, speed, mach, qbar, theta, deltaP, deltaY, throttle, mass, gLoad }` (all numbers except vNED)
  - `sampleAt(frames: TelemetryFrame[], t: number): PlaybackSample`
  - `usePlayback(frames: TelemetryFrame[], initialWarp?: number): Playback` where `Playback { sample, tSim, duration, playing, warp, done, play(), pause(), seek(t), setWarp(w), replay() }`

- [ ] **Step 1: Write the failing tests (pure math only — the hook is exercised in Task 11's view test)**

Create `apps/web/tests/playback.test.ts`:

```ts
/** Playback interpolation (landing-sim spec §3): binary search + lerp + g-load. */
import { describe, expect, it } from 'vitest';
import { G0 } from '@fds/physics-core';
import type { TelemetryFrame } from '@fds/rocket-sim';
import { frameIndexAt, sampleAt } from '../src/features/landing-sim/playbackMath';

/** Nose-up frame falling straight down at `vz` m/s (body v.x = −climb rate). */
const fallingFrame = (t: number, altitude: number, vzDown: number): TelemetryFrame => ({
  t,
  r: { x: 0, y: 0, z: -altitude },
  v: { x: -vzDown, y: 0, z: 0 }, // body X is up at θ=π/2, so falling ⇒ u = −vz
  speed: vzDown,
  mach: vzDown / 340,
  alpha: 0,
  beta: 0,
  qbar: 0.5 * 1.2 * vzDown * vzDown,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 },
  omega: { x: 0, y: 0, z: 0 },
  mass: 3000,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0,
  altitude,
});

const frames = [
  fallingFrame(0.0, 1000, 50),
  fallingFrame(0.5, 975, 50 + 0.5 * G0), // free fall: vz grows at g
  fallingFrame(1.0, 950, 50 + 1.0 * G0),
];

describe('frameIndexAt', () => {
  it('binary-searches the last frame with t ≤ tSim', () => {
    expect(frameIndexAt(frames, -1)).toBe(0);
    expect(frameIndexAt(frames, 0)).toBe(0);
    expect(frameIndexAt(frames, 0.49)).toBe(0);
    expect(frameIndexAt(frames, 0.5)).toBe(1);
    expect(frameIndexAt(frames, 99)).toBe(2);
  });
});

describe('sampleAt', () => {
  it('lerps scalar fields between the bracketing frames', () => {
    const s = sampleAt(frames, 0.25);
    expect(s.altitudeM).toBeCloseTo(987.5, 6);
    expect(s.mass).toBe(3000);
    expect(s.t).toBe(0.25);
  });
  it('clamps beyond the last frame', () => {
    const s = sampleAt(frames, 5);
    expect(s.altitudeM).toBeCloseTo(950, 6);
  });
  it('reports ~0 g in free fall (gravity subtracted from dv/dt)', () => {
    const s = sampleAt(frames, 0.25);
    expect(s.gLoad).toBeCloseTo(0, 3);
  });
  it('converts body velocity to NED (falling ⇒ vNED.z > 0)', () => {
    const s = sampleAt(frames, 0);
    expect(s.vNED.z).toBeCloseTo(50, 6);
    expect(Math.abs(s.vNED.x)).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w web -- playback`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure math**

Create `apps/web/src/features/landing-sim/playbackMath.ts`:

```ts
/**
 * Pure playback math (landing-sim spec §3): binary search into the recorded
 * telemetry, linear interpolation between bracketing frames, and the HUD's
 * g-load by finite difference of NED velocity with gravity subtracted —
 * computed here at playback so the physics packages stay untouched (spec §7).
 */

import { G0, qfromEuler321, rotateBodyToNED, type Vec3 } from '@fds/physics-core';
import type { TelemetryFrame } from '@fds/rocket-sim';

export interface PlaybackSample {
  t: number;
  northM: number;
  eastM: number;
  altitudeM: number;
  vNED: Vec3;
  speed: number;
  mach: number;
  qbar: number;
  /** Pitch θ, rad (nose-up ≈ π/2). */
  theta: number;
  deltaP: number;
  deltaY: number;
  throttle: number;
  mass: number;
  /** Non-gravitational load factor, g. */
  gLoad: number;
}

/** Index of the last frame with t ≤ tSim (frames sorted by t, length ≥ 1). */
export const frameIndexAt = (frames: TelemetryFrame[], t: number): number => {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

const vNEDof = (f: TelemetryFrame): Vec3 =>
  rotateBodyToNED(qfromEuler321(f.euler.phi, f.euler.theta, f.euler.psi), f.v);

const lerp = (a: number, b: number, s: number): number => a + (b - a) * s;

export const sampleAt = (frames: TelemetryFrame[], t: number): PlaybackSample => {
  const i = frameIndexAt(frames, t);
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const dt = b.t - a.t;
  const s = dt > 0 ? Math.min(1, Math.max(0, (t - a.t) / dt)) : 0;
  const va = vNEDof(a);
  const vb = vNEDof(b);
  // Specific force between the bracketing frames: dv/dt − g. NED z is down,
  // so gravity contributes (0, 0, +G0) and is subtracted from the z channel.
  const gLoad =
    dt > 0
      ? Math.hypot((vb.x - va.x) / dt, (vb.y - va.y) / dt, (vb.z - va.z) / dt - G0) / G0
      : 0;
  return {
    t,
    northM: lerp(a.r.x, b.r.x, s),
    eastM: lerp(a.r.y, b.r.y, s),
    altitudeM: lerp(a.altitude, b.altitude, s),
    vNED: { x: lerp(va.x, vb.x, s), y: lerp(va.y, vb.y, s), z: lerp(va.z, vb.z, s) },
    speed: lerp(a.speed, b.speed, s),
    mach: lerp(a.mach, b.mach, s),
    qbar: lerp(a.qbar, b.qbar, s),
    theta: lerp(a.euler.theta, b.euler.theta, s),
    deltaP: lerp(a.deltaP, b.deltaP, s),
    deltaY: lerp(a.deltaY, b.deltaY, s),
    throttle: lerp(a.throttle, b.throttle, s),
    mass: lerp(a.mass, b.mass, s),
    gLoad,
  };
};
```

- [ ] **Step 4: Implement the hook**

Create `apps/web/src/features/landing-sim/usePlayback.ts`:

```ts
/**
 * Playback clock (landing-sim spec §3): a rAF loop maps wall time × warp →
 * sim time; pause, scrub, warp, and replay are operations on the clock only —
 * the physics already ran, once, in the worker.
 */

import { useEffect, useRef, useState } from 'react';
import type { TelemetryFrame } from '@fds/rocket-sim';
import { sampleAt, type PlaybackSample } from './playbackMath';

/** Clamp on a single frame's wall delta (tab switches), same as useFixedTimestepLoop. */
const MAX_FRAME_S = 0.25;

export interface Playback {
  sample: PlaybackSample;
  tSim: number;
  duration: number;
  playing: boolean;
  warp: number;
  /** True once playback has reached the end of the recording. */
  done: boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setWarp(w: number): void;
  replay(): void;
}

export const usePlayback = (frames: TelemetryFrame[], initialWarp = 5): Playback => {
  const duration = frames.length > 0 ? frames[frames.length - 1].t : 0;
  const [tSim, setTSim] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [warp, setWarp] = useState(initialWarp);

  // Mutable clock read by the rAF loop without restarting it (same pattern as
  // useFixedTimestepLoop's fns ref).
  const clock = useRef({ playing: true, warp: initialWarp, t: 0 });
  clock.current.playing = playing;
  clock.current.warp = warp;

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      if (last !== null && clock.current.playing) {
        const dt = Math.min((now - last) / 1000, MAX_FRAME_S) * clock.current.warp;
        clock.current.t = Math.min(duration, clock.current.t + dt);
        setTSim(clock.current.t);
        if (clock.current.t >= duration) setPlaying(false);
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return {
    sample: sampleAt(frames, tSim),
    tSim,
    duration,
    playing,
    warp,
    done: duration > 0 && tSim >= duration,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    seek: (t: number) => {
      clock.current.t = Math.min(duration, Math.max(0, t));
      setTSim(clock.current.t);
    },
    setWarp,
    replay: () => {
      clock.current.t = 0;
      setTSim(0);
      setPlaying(true);
    },
  };
};
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w web -- playback`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/landing-sim/playbackMath.ts apps/web/src/features/landing-sim/usePlayback.ts apps/web/tests/playback.test.ts
git commit -m "feat(web): playback engine — interpolated samples, g-load, warp clock"
```

---

### Task 8: Camera + canvas renderer

**Files:**
- Create: `apps/web/src/features/landing-sim/camera.ts`
- Create: `apps/web/src/features/landing-sim/LandingCanvas.tsx`
- Test: `apps/web/tests/camera.test.ts`

**Interfaces:**
- Consumes: `PlaybackSample` (Task 7), palette tokens, `Verdict` (Task 6).
- Produces:
  - `CameraView { metersPerPx: number; hLow: number; centerN: number }`
  - `cameraFor(altitudeM: number, rocketNorthM: number, viewHpx: number): CameraView`
  - `worldToScreen(northM: number, altitudeM: number, cam: CameraView, viewWpx: number, viewHpx: number): { x: number; y: number }`
  - `LandingCanvas({ sample, touchdown }: { sample: PlaybackSample; touchdown: { verdict: Verdict; tSince: number } | null }): JSX.Element` — a 760×520 canvas; Task 12 extends the `touchdown` rendering.

- [ ] **Step 1: Write the failing camera tests**

Create `apps/web/tests/camera.test.ts`:

```ts
/** Dynamic-zoom camera (landing-sim spec §6): one continuous shot. */
import { describe, expect, it } from 'vitest';
import { cameraFor, worldToScreen } from '../src/features/landing-sim/camera';

const W = 760;
const H = 520;

describe('cameraFor / worldToScreen', () => {
  it('keeps the rocket anchored ~62% up the frame while high', () => {
    for (const h of [30000, 15000, 5000, 1000]) {
      const cam = cameraFor(h, 0, H);
      const { y } = worldToScreen(0, h, cam, W, H);
      expect(y).toBeCloseTo(H * (1 - 0.62), 0); // ±0.5 px
    }
  });
  it('shows the ground line inside the frame on final approach', () => {
    const cam = cameraFor(40, 0, H);
    const ground = worldToScreen(0, 0, cam, W, H);
    expect(ground.y).toBeLessThanOrEqual(H);
    expect(ground.y).toBeGreaterThan(H * 0.5); // ground in the lower half
    const rocket = worldToScreen(0, 40, cam, W, H);
    expect(rocket.y).toBeGreaterThan(0);
    expect(rocket.y).toBeLessThan(ground.y); // rocket above the ground
  });
  it('zooms monotonically: metersPerPx shrinks as altitude drops', () => {
    const high = cameraFor(20000, 0, H).metersPerPx;
    const mid = cameraFor(2000, 0, H).metersPerPx;
    const low = cameraFor(50, 0, H).metersPerPx;
    expect(mid).toBeLessThan(high);
    expect(low).toBeLessThan(mid);
  });
  it('maps north offsets horizontally about the rocket', () => {
    const cam = cameraFor(1000, -3000, H); // rocket 3 km south of the pad
    const rocket = worldToScreen(-3000, 1000, cam, W, H);
    const pad = worldToScreen(0, 0, cam, W, H);
    expect(rocket.x).toBeCloseTo(W / 2, 6);
    expect(pad.x).toBeGreaterThan(W / 2); // pad to the right (north = +x screen)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w web -- camera`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the camera**

Create `apps/web/src/features/landing-sim/camera.ts`:

```ts
/**
 * Continuous dynamic-zoom camera (landing-sim spec §6): the vertical view
 * window shrinks with altitude — H_view = clamp(K·h, H_MIN, H_MAX) — with the
 * rocket anchored at ROCKET_ANCHOR of frame height until the ground rises
 * into frame (hLow clamps at 0), so touchdown composes itself. Pure math:
 * unit-testable without a canvas.
 */

export interface CameraView {
  metersPerPx: number;
  /** World altitude at the bottom edge of the frame, m. */
  hLow: number;
  /** World north coordinate at the horizontal center, m. */
  centerN: number;
}

const H_MIN = 120; // final-approach window height, m
const H_MAX = 60000; // never wider than this, m
const K = 2.2; // window height ≈ K × altitude mid-descent
const ROCKET_ANCHOR = 0.62; // rocket's height in frame, fraction from bottom

export const cameraFor = (
  altitudeM: number,
  rocketNorthM: number,
  viewHpx: number,
): CameraView => {
  const hView = Math.min(H_MAX, Math.max(H_MIN, K * altitudeM));
  const hLow = Math.max(0, altitudeM - ROCKET_ANCHOR * hView);
  return { metersPerPx: hView / viewHpx, hLow, centerN: rocketNorthM };
};

export const worldToScreen = (
  northM: number,
  altitudeM: number,
  cam: CameraView,
  viewWpx: number,
  viewHpx: number,
): { x: number; y: number } => ({
  x: viewWpx / 2 + (northM - cam.centerN) / cam.metersPerPx,
  y: viewHpx - (altitudeM - cam.hLow) / cam.metersPerPx,
});
```

- [ ] **Step 4: Run camera tests**

Run: `npm run test -w web -- camera`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the canvas renderer**

Create `apps/web/src/features/landing-sim/LandingCanvas.tsx`:

```tsx
/**
 * Canvas renderer (landing-sim spec §6): flat icon-style vector art — sky
 * gradient by altitude, ground, pad, rocket silhouette at true pitch, flame
 * as a throttle-scaled triangle with a deterministic sim-time flicker (no
 * randomness — runs replay identically). Redrawn every rAF from the current
 * playback sample. Task 12 fills in the per-verdict touchdown visuals.
 */

import { useEffect, useRef, type JSX } from 'react';
import { INK_2, MUTED, STATUS } from '../../lib/palette';
import { cameraFor, worldToScreen } from './camera';
import type { PlaybackSample } from './playbackMath';
import type { Verdict } from './types';

export const CANVAS_W = 760;
export const CANVAS_H = 520;

/** Vehicle length for the silhouette, m (§8.1 reference booster geometry). */
const ROCKET_LEN_M = 12;
/** Landing legs deploy below this AGL (visual-only discrete event, spec origin §3). */
const LEG_DEPLOY_AGL_M = 150;

/** Linear blend of two #rrggbb colors. */
const mix = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export interface TouchdownVisual {
  verdict: Verdict;
  /** Seconds of sim time since touchdown (drives the fail animations). */
  tSince: number;
}

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  sample: PlaybackSample,
  touchdown: TouchdownVisual | null,
): void => {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const cam = cameraFor(sample.altitudeM, sample.northM, H);

  // Sky: space-black above 20 km blending to day blue at the deck.
  ctx.fillStyle = mix('#87b7e4', '#05070f', sample.altitudeM / 20000);
  ctx.fillRect(0, 0, W, H);

  // Ground + pad (world altitude 0), visible once inside the window.
  const ground = worldToScreen(0, 0, cam, W, H);
  if (ground.y <= H + 2) {
    ctx.fillStyle = '#131811';
    ctx.fillRect(0, ground.y, W, H - ground.y + 2);
    const pad = worldToScreen(0, 0, cam, W, H); // pad at north 0 (landing target)
    const padRpx = Math.max(6, 15 / cam.metersPerPx);
    ctx.strokeStyle = STATUS.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, ground.y, padRpx, Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.x - padRpx * 0.5, ground.y);
    ctx.lineTo(pad.x + padRpx * 0.5, ground.y);
    ctx.stroke();
  }

  // Rocket silhouette at true pitch (nose-up θ = π/2 ⇒ upright on screen).
  const pos = worldToScreen(sample.northM, sample.altitudeM, cam, W, H);
  const lenPx = Math.max(16, ROCKET_LEN_M / cam.metersPerPx);
  const wPx = Math.max(4, lenPx / 7);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.PI / 2 - sample.theta); // screen-up when θ = π/2

  // Flame: throttle-scaled triangle at the tail, deterministic flicker.
  if (sample.throttle > 0.01) {
    const flick = 1 + 0.08 * Math.sin(40 * sample.t);
    const flameLen = lenPx * 0.9 * sample.throttle * flick;
    const grad = ctx.createLinearGradient(0, lenPx / 2, 0, lenPx / 2 + flameLen);
    grad.addColorStop(0, STATUS.warning);
    grad.addColorStop(1, 'rgba(236,131,90,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-wPx * 0.45, lenPx / 2);
    ctx.lineTo(wPx * 0.45, lenPx / 2);
    ctx.lineTo(0, lenPx / 2 + flameLen);
    ctx.closePath();
    ctx.fill();
  }

  // Body + nose + fins (+ legs on final approach).
  ctx.fillStyle = INK_2;
  ctx.fillRect(-wPx / 2, -lenPx / 2 + wPx, wPx, lenPx - wPx);
  ctx.beginPath();
  ctx.moveTo(-wPx / 2, -lenPx / 2 + wPx);
  ctx.lineTo(0, -lenPx / 2);
  ctx.lineTo(wPx / 2, -lenPx / 2 + wPx);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.beginPath();
  ctx.moveTo(-wPx / 2, lenPx / 2);
  ctx.lineTo(-wPx * 1.1, lenPx / 2);
  ctx.lineTo(-wPx / 2, lenPx / 2 - wPx * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(wPx / 2, lenPx / 2);
  ctx.lineTo(wPx * 1.1, lenPx / 2);
  ctx.lineTo(wPx / 2, lenPx / 2 - wPx * 1.6);
  ctx.closePath();
  ctx.fill();
  if (sample.altitudeM < LEG_DEPLOY_AGL_M) {
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = Math.max(1.5, wPx * 0.18);
    ctx.beginPath();
    ctx.moveTo(-wPx / 2, lenPx / 2 - wPx);
    ctx.lineTo(-wPx * 1.2, lenPx / 2 + wPx * 0.5);
    ctx.moveTo(wPx / 2, lenPx / 2 - wPx);
    ctx.lineTo(wPx * 1.2, lenPx / 2 + wPx * 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // Touchdown overlay (Task 12 expands this per verdict kind).
  if (touchdown && touchdown.verdict.kind === 'success') {
    const pad = worldToScreen(0, 0, cam, W, H);
    const pulse = (touchdown.tSince % 1.2) / 1.2;
    ctx.strokeStyle = STATUS.good;
    ctx.globalAlpha = 1 - pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 10 + pulse * 60, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
};

export const LandingCanvas = ({
  sample,
  touchdown,
}: {
  sample: PlaybackSample;
  touchdown: TouchdownVisual | null;
}): JSX.Element => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawScene(ctx, sample, touchdown);
  });

  return (
    <canvas
      ref={ref}
      width={CANVAS_W}
      height={CANVAS_H}
      className="scene-canvas"
      role="img"
      aria-label="Landing simulation view"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    />
  );
};
```

- [ ] **Step 6: Typecheck**

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/landing-sim/camera.ts apps/web/src/features/landing-sim/LandingCanvas.tsx apps/web/tests/camera.test.ts
git commit -m "feat(web): landing canvas — dynamic-zoom camera and vector rocket scene"
```

---

### Task 9: HUD dashboard

**Files:**
- Create: `apps/web/src/features/landing-sim/Dashboard.tsx`

**Interfaces:**
- Consumes: `PlaybackSample` (Task 7), `PhaseTimes` + `PhaseLabel` (Task 4 types), `fmt`/`fmtKm`/`fmtDeg`/`fmtKPa`/`fmtS` from `unitsDisplay`, palette `STATUS`.
- Produces: `phaseAt(t: number, times: PhaseTimes, tTouchdown: number): PhaseLabel` (exported for the view/tests) and `Dashboard({ sample, times, duration, propellantKg0, dryKg }): JSX.Element`.

No dedicated test file — `phaseAt` is asserted inside Task 11's view test; the component is pure presentation over already-tested numbers.

- [ ] **Step 1: Implement**

Create `apps/web/src/features/landing-sim/Dashboard.tsx`:

```tsx
/**
 * Live telemetry HUD (landing-sim spec §7): every field from the current
 * playback sample; phase from the run's timestamps; T− countdown exact
 * (the recording is complete). Aerospace conventions per unitsDisplay/palette.
 */

import { type JSX } from 'react';
import { STATUS } from '../../lib/palette';
import { fmt, fmtDeg, fmtKPa, fmtS } from '../../lib/unitsDisplay';
import type { PlaybackSample } from './playbackMath';
import type { PhaseLabel, PhaseTimes } from './types';

export const phaseAt = (t: number, times: PhaseTimes, tTouchdown: number): PhaseLabel => {
  if (t >= tTouchdown) return 'TOUCHDOWN';
  if (times.landingIgnitionTime !== null && t >= times.landingIgnitionTime) return 'LANDING BURN';
  if (
    times.entryBurnIgnitionTime !== null &&
    t >= times.entryBurnIgnitionTime &&
    (times.entryBurnCutoffTime === null || t < times.entryBurnCutoffTime)
  ) {
    return 'ENTRY BURN';
  }
  return 'FREEFALL';
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    <span className="unit">{unit}</span>
  </div>
);

export const Dashboard = ({
  sample,
  times,
  duration,
  propellantKg0,
  dryKg,
}: {
  sample: PlaybackSample;
  times: PhaseTimes;
  duration: number;
  /** Propellant at entry, kg (for the remaining-% readout). */
  propellantKg0: number;
  dryKg: number;
}): JSX.Element => {
  const phase = phaseAt(sample.t, times, duration);
  const propPct = propellantKg0 > 0 ? (100 * (sample.mass - dryKg)) / propellantKg0 : 0;
  const vHoriz = Math.hypot(sample.vNED.x, sample.vNED.y);
  const burning = phase === 'ENTRY BURN' || phase === 'LANDING BURN';

  return (
    <div className="panel">
      <h2>Telemetry</h2>
      <p>
        <span
          className="chip"
          style={{ color: burning ? STATUS.warning : undefined }}
        >
          {phase}
        </span>{' '}
        <span className="chip">T−{fmtS(Math.max(0, duration - sample.t))} s</span>
      </p>
      <div className="stat-grid">
        <Stat label="altitude" value={fmt(sample.altitudeM, 0)} unit="m AGL" />
        <Stat label="v vertical" value={fmt(-sample.vNED.z, 1)} unit="m/s" />
        <Stat label="v horizontal" value={fmt(vHoriz, 1)} unit="m/s" />
        <Stat label="speed" value={fmt(sample.speed, 1)} unit="m/s" />
        <Stat label="Mach" value={fmt(sample.mach, 2)} unit="" />
        <Stat label="q̄" value={fmtKPa(sample.qbar)} unit="kPa" />
        <Stat label="g-load" value={fmt(sample.gLoad, 2)} unit="g" />
        <Stat label="throttle" value={fmt(sample.throttle * 100, 0)} unit="%" />
        <Stat label="propellant" value={fmt(Math.max(0, propPct), 1)} unit="%" />
        <Stat label="pitch θ" value={fmtDeg(sample.theta)} unit="°" />
        <Stat label="gimbal δp" value={fmtDeg(sample.deltaP, 2)} unit="°" />
        <Stat label="gimbal δy" value={fmtDeg(sample.deltaY, 2)} unit="°" />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run build:web`
Expected: PASS. (Note: `fmtDeg` takes `(rad, digits?)` — matches `unitsDisplay.ts`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/landing-sim/Dashboard.tsx
git commit -m "feat(web): landing HUD — phase chip, T-minus, full telemetry grid"
```

---

### Task 10: Entry-point selector

**Files:**
- Create: `apps/web/src/features/landing-sim/EntryPointSelector.tsx`

**Interfaces:**
- Consumes: `EntryInputs`, `CaptureGrid` (Task 4 types), palette tokens, `fmtDeg`/`fmtKm` from unitsDisplay, `degToRad`/`radToDeg`.
- Produces: `ENTRY_RANGES` (exported consts: `V: [150, 800]`, `H: [6000, 25000]`, `GAMMA_DEG: [-88, -35]`, `DOWNRANGE: [0, 8000]`, `N_V: 12`, `N_H: 10`) and `EntryPointSelector({ inputs, grid, onChange, onLaunch, disabled }): JSX.Element`. The view (Task 11) uses `ENTRY_RANGES` to build `CaptureRequest`s.

- [ ] **Step 1: Implement**

Create `apps/web/src/features/landing-sim/EntryPointSelector.tsx`:

```tsx
/**
 * Draggable entry-point input (landing-sim spec §5): SVG plot — x entry speed,
 * y entry altitude — with the streamed capture-region grid shaded behind the
 * point (green lands / amber misses / red crashes, greyed while stale), plus
 * γ and downrange sliders. SVG is right here: static plot, pointer-driven
 * (the live animation is the canvas's job).
 */

import { useRef, type JSX, type PointerEvent } from 'react';
import { AXIS, GRID, INK, MUTED, STATUS } from '../../lib/palette';
import { degToRad, fmtDeg, fmtKm } from '../../lib/unitsDisplay';
import type { CaptureGrid, CaptureOutcome, EntryInputs } from './types';

export const ENTRY_RANGES = {
  V: [150, 800] as [number, number],
  H: [6000, 25000] as [number, number],
  GAMMA_DEG: [-88, -35] as [number, number],
  DOWNRANGE: [0, 8000] as [number, number],
  N_V: 12,
  N_H: 10,
};

const W = 460;
const H = 300;
const M = { l: 52, r: 14, t: 14, b: 40 }; // plot margins
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

const CELL_FILL: Record<CaptureOutcome, string> = {
  lands: STATUS.good,
  misses: STATUS.warning,
  crashes: STATUS.critical,
};

export const EntryPointSelector = ({
  inputs,
  grid,
  onChange,
  onLaunch,
  disabled,
}: {
  inputs: EntryInputs;
  grid: CaptureGrid;
  onChange(next: EntryInputs): void;
  onLaunch(): void;
  disabled: boolean;
}): JSX.Element => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vLo, vHi] = ENTRY_RANGES.V;
  const [hLo, hHi] = ENTRY_RANGES.H;

  const px = (v: number): number => M.l + ((v - vLo) / (vHi - vLo)) * PW;
  const py = (h: number): number => M.t + PH - ((h - hLo) / (hHi - hLo)) * PH;

  const dragTo = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = svgRef.current!.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) * (W / rect.width) - M.l) / PW;
    const fy = (M.t + PH - (e.clientY - rect.top) * (H / rect.height)) / PH;
    onChange({
      ...inputs,
      speedMps: Math.min(vHi, Math.max(vLo, vLo + fx * (vHi - vLo))),
      altitudeM: Math.min(hHi, Math.max(hLo, hLo + fy * (hHi - hLo))),
    });
  };

  const cellW = PW / grid.nV;
  const cellH = PH / grid.nH;

  return (
    <div className="panel">
      <h2>Entry point</h2>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        role="application"
        aria-label="Entry point selector"
        style={{ touchAction: 'none', cursor: 'crosshair', maxWidth: '100%' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragTo(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) dragTo(e);
        }}
      >
        <rect width={W} height={H} rx={10} fill="#0a0f16" stroke={AXIS} />
        {/* capture-region shading, [iH][iV], greyed while a fresh sweep streams */}
        <g opacity={grid.stale ? 0.12 : 0.3}>
          {grid.cells.map((row, iH) =>
            row.map((cell, iV) =>
              cell === null ? null : (
                <rect
                  key={`${iH}-${iV}`}
                  x={M.l + iV * cellW}
                  y={M.t + PH - (iH + 1) * cellH}
                  width={cellW}
                  height={cellH}
                  fill={CELL_FILL[cell]}
                />
              ),
            ),
          )}
        </g>
        {/* axes */}
        <line x1={M.l} y1={M.t + PH} x2={M.l + PW} y2={M.t + PH} stroke={GRID} />
        <line x1={M.l} y1={M.t} x2={M.l} y2={M.t + PH} stroke={GRID} />
        <text x={M.l + PW / 2} y={H - 12} fill={MUTED} fontSize={11} textAnchor="middle">
          entry speed (m/s)
        </text>
        <text
          x={16}
          y={M.t + PH / 2}
          fill={MUTED}
          fontSize={11}
          textAnchor="middle"
          transform={`rotate(-90 16 ${M.t + PH / 2})`}
        >
          entry altitude (km)
        </text>
        <text x={M.l - 6} y={py(hLo) + 4} fill={MUTED} fontSize={10} textAnchor="end">
          {fmtKm(hLo, 0)}
        </text>
        <text x={M.l - 6} y={py(hHi) + 4} fill={MUTED} fontSize={10} textAnchor="end">
          {fmtKm(hHi, 0)}
        </text>
        <text x={px(vLo)} y={M.t + PH + 14} fill={MUTED} fontSize={10} textAnchor="middle">
          {vLo}
        </text>
        <text x={px(vHi)} y={M.t + PH + 14} fill={MUTED} fontSize={10} textAnchor="middle">
          {vHi}
        </text>
        {/* the draggable entry point */}
        <circle
          cx={px(inputs.speedMps)}
          cy={py(inputs.altitudeM)}
          r={7}
          fill={INK}
          stroke={STATUS.good}
          strokeWidth={2}
        />
      </svg>
      <div className="field">
        <label>
          flight-path angle γ: {fmtDeg(inputs.gammaRad)}°
          <input
            type="range"
            min={ENTRY_RANGES.GAMMA_DEG[0]}
            max={ENTRY_RANGES.GAMMA_DEG[1]}
            step={1}
            value={Math.round((inputs.gammaRad * 180) / Math.PI)}
            onChange={(e) => onChange({ ...inputs, gammaRad: degToRad(Number(e.target.value)) })}
          />
        </label>
      </div>
      <div className="field">
        <label>
          downrange offset: {fmtKm(inputs.downrangeM)} km
          <input
            type="range"
            min={ENTRY_RANGES.DOWNRANGE[0]}
            max={ENTRY_RANGES.DOWNRANGE[1]}
            step={100}
            value={inputs.downrangeM}
            onChange={(e) => onChange({ ...inputs, downrangeM: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onLaunch} disabled={disabled}>
          Launch
        </button>
        <span className="hint">
          {grid.stale ? 'computing capture region…' : 'green = lands on pad · amber = misses · red = crashes'}
        </span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/landing-sim/EntryPointSelector.tsx
git commit -m "feat(web): draggable entry-point selector with streamed capture shading"
```

---

### Task 11: Wire the full view — worker, playback, controls, verdict

**Files:**
- Modify: `apps/web/src/features/landing-sim/LandingSimView.tsx` (replace the skeleton)
- Test: `apps/web/tests/landing-view.test.tsx`

**Interfaces:**
- Consumes: everything above — `createLandingSimWorker`, `LandingSimRequest/Response`, `EntryPointSelector` + `ENTRY_RANGES`, `usePlayback`, `LandingCanvas`, `Dashboard` + `phaseAt`, `classifyLanding`, `referenceRocket`.
- Produces: the finished `LandingSimView` — setup ↔ flight modes, warp buttons 1/2/5/10×, pause/play, scrub bar, verdict banner revealed only when playback is done, Replay + New-entry buttons.

- [ ] **Step 1: Write the failing view test**

Create `apps/web/tests/landing-view.test.tsx`:

```tsx
/**
 * Module D view flow with a stubbed Worker: launch posts an entry-run, the
 * synthetic result switches to flight mode, and the verdict stays hidden
 * until playback completes (spec §3 "no spoilers").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TelemetryFrame } from '@fds/rocket-sim';
import type { EntryRunResult, LandingSimRequest } from '../src/lib/simWorker';
import { phaseAt } from '../src/features/landing-sim/Dashboard';

const frame = (t: number, altitude: number): TelemetryFrame => ({
  t,
  r: { x: 0, y: 0, z: -altitude },
  v: { x: -10, y: 0, z: 0 },
  speed: 10,
  mach: 0.03,
  alpha: 0,
  beta: 0,
  qbar: 60,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 },
  omega: { x: 0, y: 0, z: 0 },
  mass: 3000,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0.6,
  altitude,
});

const RESULT: EntryRunResult = {
  kind: 'entry-result',
  telemetry: [frame(0, 100), frame(5, 50), frame(10, 0)],
  summary: {
    apogeeAltitude: 100, apogeeTime: 0, maxMach: 1, maxQbar: 100, maxQbarTime: 0,
    maxAxialG: 2, maxAxialGTime: 0, maxLateralG: 0.1, maxLateralGTime: 0,
    burnoutTime: null, flightTime: 10,
    landing: {
      touchedDown: true, ignitionTime: 2, touchdownVz: 1.0,
      touchdownLateralSpeed: 0.2, missDistance: 3, touchdownG: 1.1, propellantUsedKg: 400,
    },
  },
  entryBurnIgnitionTime: 1,
  entryBurnCutoffTime: 3,
  landingIgnitionTime: 6,
};

/** Worker stub: records posts; the test fires responses by hand. */
class WorkerStub {
  static last: WorkerStub | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  posted: LandingSimRequest[] = [];
  constructor() {
    WorkerStub.last = this;
  }
  postMessage(msg: LandingSimRequest): void {
    this.posted.push(msg);
  }
  terminate(): void {}
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', WorkerStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('phaseAt', () => {
  it('walks FREEFALL → ENTRY BURN → FREEFALL → LANDING BURN → TOUCHDOWN', () => {
    const times = { entryBurnIgnitionTime: 1, entryBurnCutoffTime: 3, landingIgnitionTime: 6 };
    expect(phaseAt(0.5, times, 10)).toBe('FREEFALL');
    expect(phaseAt(2, times, 10)).toBe('ENTRY BURN');
    expect(phaseAt(4, times, 10)).toBe('FREEFALL');
    expect(phaseAt(7, times, 10)).toBe('LANDING BURN');
    expect(phaseAt(10, times, 10)).toBe('TOUCHDOWN');
  });
});

describe('LandingSimView flow', () => {
  it('posts a capture sweep on mount and an entry-run on Launch, then flies', async () => {
    const { LandingSimView } = await import('../src/features/landing-sim/LandingSimView');
    render(<LandingSimView />);
    const w = WorkerStub.last!;
    expect(w.posted.some((m) => m.kind === 'capture')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Launch/ }));
    const run = w.posted.find((m) => m.kind === 'entry-run');
    expect(run).toBeTruthy();

    w.reply(RESULT);
    // Flight mode: canvas + HUD mounted; verdict hidden (playback at t=0).
    expect(await screen.findByRole('img', { name: /Landing simulation view/ })).toBeTruthy();
    expect(screen.getByText(/Telemetry/)).toBeTruthy();
    expect(screen.queryByText(/landing is confirmed/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w web -- landing-view`
Expected: FAIL — the skeleton has no worker/Launch flow.

- [ ] **Step 3: Replace `LandingSimView.tsx`**

```tsx
/**
 * D · Landing (landing-sim spec §3, §5): setup mode (entry selector fed by the
 * streamed capture sweep) → Launch → worker runs the whole descent headless →
 * flight mode plays the recording back — canvas + HUD + warp/scrub — and the
 * precomputed verdict is revealed only when playback reaches touchdown.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { STATUS } from '../../lib/palette';
import { referenceRocket } from '../../lib/data';
import {
  createLandingSimWorker,
  type EntryRunResult,
  type LandingSimResponse,
} from '../../lib/simWorker';
import { Dashboard } from './Dashboard';
import { EntryPointSelector, ENTRY_RANGES } from './EntryPointSelector';
import { LandingCanvas, type TouchdownVisual } from './LandingCanvas';
import { usePlayback } from './usePlayback';
import { classifyLanding } from './verdict';
import type { CaptureGrid, EntryInputs, Verdict } from './types';

export const DEFAULT_INPUTS: EntryInputs = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-70 * Math.PI) / 180,
  downrangeM: 3000,
  propellantKg: 1500,
};

const WARPS = [1, 2, 5, 10];

const emptyGrid = (): CaptureGrid => ({
  nV: ENTRY_RANGES.N_V,
  nH: ENTRY_RANGES.N_H,
  vRange: ENTRY_RANGES.V,
  hRange: ENTRY_RANGES.H,
  cells: Array.from({ length: ENTRY_RANGES.N_H }, () =>
    Array.from({ length: ENTRY_RANGES.N_V }, () => null),
  ),
  stale: true,
});

const VERDICT_TONE: Record<Verdict['kind'], string> = {
  success: 'good',
  'missed-pad': 'warning',
  'no-touchdown': 'warning',
  'hard-landing': 'critical',
  'tip-over': 'critical',
  'out-of-propellant': 'critical',
  rud: 'critical',
};

/** Flight-mode inner component so playback hooks mount only with a run. */
const Flight = ({
  run,
  inputs,
  onReset,
}: {
  run: EntryRunResult;
  inputs: EntryInputs;
  onReset(): void;
}): JSX.Element => {
  const cfg = useMemo(referenceRocket, []);
  const pb = usePlayback(run.telemetry, 5);
  const verdict = useMemo(
    () =>
      classifyLanding(
        run.summary.landing,
        run.telemetry[run.telemetry.length - 1],
        cfg,
      ),
    [run, cfg],
  );
  const touchdown: TouchdownVisual | null = pb.done
    ? { verdict, tSince: pb.tSim - pb.duration + 1 } // ≥ 1 s into the animation once done
    : null;

  return (
    <div className="landing-flight">
      <div className="landing-canvas-wrap">
        <LandingCanvas sample={pb.sample} touchdown={touchdown} />
        {pb.done && (
          <span className={`chip ${VERDICT_TONE[verdict.kind]} landing-verdict`}>
            {verdict.kind === 'success' ? '✓ ' : '✗ '}
            {verdict.detail}
          </span>
        )}
        <div className="landing-controls" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={pb.playing ? pb.pause : pb.play}>
            {pb.playing ? '⏸' : '▶'}
          </button>
          {WARPS.map((w) => (
            <button
              key={w}
              type="button"
              className="btn"
              aria-pressed={pb.warp === w}
              style={pb.warp === w ? { borderColor: STATUS.good } : undefined}
              onClick={() => pb.setWarp(w)}
            >
              {w}×
            </button>
          ))}
          <input
            type="range"
            min={0}
            max={pb.duration}
            step={0.1}
            value={pb.tSim}
            aria-label="Scrub playback"
            onChange={(e) => pb.seek(Number(e.target.value))}
          />
          <button type="button" className="btn" onClick={pb.replay}>
            Replay
          </button>
          <button type="button" className="btn" onClick={onReset}>
            ◀ New entry
          </button>
        </div>
      </div>
      <Dashboard
        sample={pb.sample}
        times={run}
        duration={pb.duration}
        propellantKg0={inputs.propellantKg}
        dryKg={cfg.mass.dryKg}
      />
    </div>
  );
};

export const LandingSimView = (): JSX.Element => {
  const [inputs, setInputs] = useState<EntryInputs>(DEFAULT_INPUTS);
  const [grid, setGrid] = useState<CaptureGrid>(emptyGrid);
  const [run, setRun] = useState<EntryRunResult | null>(null);
  const [awaitingRun, setAwaitingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // One worker for the module's lifetime; jsdom-free environments skip it.
  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;
    const w = createLandingSimWorker();
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<LandingSimResponse>) => {
      const msg = ev.data;
      if (msg.kind === 'entry-result') {
        setAwaitingRun(false);
        setRun(msg);
      } else if (msg.kind === 'capture-cell') {
        setGrid((g) => {
          const cells = g.cells.map((row) => row.slice());
          cells[msg.iH][msg.iV] = msg.outcome;
          return { ...g, cells };
        });
      } else if (msg.kind === 'capture-done') {
        setGrid((g) => ({ ...g, stale: false }));
      } else if (msg.kind === 'error') {
        setAwaitingRun(false);
        setError(msg.message);
      }
    };
    return () => w.terminate();
  }, []);

  // Capture sweep on mount and (debounced) when γ / downrange change — the
  // grid axes ARE v and h, so dragging the point never invalidates it.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return undefined;
    setGrid((g) => ({ ...emptyGrid(), cells: g.cells, stale: true }));
    const id = setTimeout(() => {
      w.postMessage({
        kind: 'capture',
        gammaRad: inputs.gammaRad,
        downrangeM: inputs.downrangeM,
        propellantKg: inputs.propellantKg,
        vRange: ENTRY_RANGES.V,
        hRange: ENTRY_RANGES.H,
        nV: ENTRY_RANGES.N_V,
        nH: ENTRY_RANGES.N_H,
      });
    }, 300);
    return () => clearTimeout(id);
  }, [inputs.gammaRad, inputs.downrangeM, inputs.propellantKg]);

  const launch = (): void => {
    const w = workerRef.current;
    if (!w) return;
    setError(null);
    setAwaitingRun(true);
    w.postMessage({
      kind: 'entry-run',
      scenario: {
        altitudeM: inputs.altitudeM,
        speedMps: inputs.speedMps,
        gammaRad: inputs.gammaRad,
        downrangeM: inputs.downrangeM,
        propellantKg: inputs.propellantKg,
      },
      sampleEvery: 2,
    });
  };

  if (run) {
    return (
      <div className="landing-layout">
        <Flight run={run} inputs={inputs} onReset={() => setRun(null)} />
      </div>
    );
  }

  return (
    <div className="landing-layout">
      <EntryPointSelector
        inputs={inputs}
        grid={grid}
        onChange={setInputs}
        onLaunch={launch}
        disabled={awaitingRun}
      />
      {awaitingRun && <p className="hint">running the descent…</p>}
      {error && <p className="error-note">{error}</p>}
    </div>
  );
};
```

Note: `times={run}` works because `EntryRunResult` structurally contains the three `PhaseTimes` fields.

- [ ] **Step 4: Run the web tests**

Run: `npm run test -w web`
Expected: PASS — landing-view (2), playback, camera, verdict, smoke all green. (jsdom provides rAF; the playback clock ticks are irrelevant to the assertions, which check t=0 state.)

- [ ] **Step 5: Manual check in the browser**

Run: `npm run dev:web` — open the local URL, switch to `D · Landing`:
- capture region shades in within ~10 s; drag the dot; sliders grey + refresh the grid;
- Launch on a green cell → flight mode, rocket descends, HUD counts down, warp buttons work, scrub works;
- verdict chip appears only at touchdown.
Note any obvious visual glitches; fix only real defects (not aesthetics) in this task. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/landing-sim/LandingSimView.tsx apps/web/tests/landing-view.test.tsx
git commit -m "feat(web): wire the landing sim — worker flow, playback controls, verdict reveal"
```

---

### Task 12: Distinct failure-mode visuals

**Files:**
- Modify: `apps/web/src/features/landing-sim/LandingCanvas.tsx` (expand the touchdown overlay)

**Interfaces:**
- Consumes: `TouchdownVisual { verdict, tSince }` already passed by the view; palette `STATUS`.
- Produces: per-verdict animations, all deterministic functions of `tSince` (spec §7 second pass — this completes the feature's required scope).

- [ ] **Step 1: Replace the success-only overlay block in `drawScene`**

Replace the `// Touchdown overlay (Task 12 expands this per verdict kind).` block with:

```ts
  // Touchdown overlay: per-verdict visuals (landing-sim spec §7). Everything
  // is a pure function of tSince — replays are identical, no randomness.
  if (touchdown) {
    const { verdict, tSince } = touchdown;
    const pad = worldToScreen(0, 0, cam, W, H);
    const site = worldToScreen(sample.northM, 0, cam, W, H);
    const a = Math.min(1, tSince / 0.8); // 0→1 intro ramp

    switch (verdict.kind) {
      case 'success': {
        const pulse = (tSince % 1.2) / 1.2;
        ctx.strokeStyle = STATUS.good;
        ctx.globalAlpha = 1 - pulse;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, 10 + pulse * 60, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'hard-landing':
      case 'out-of-propellant': {
        // Impact flash + dust ring at the touchdown site.
        ctx.globalAlpha = Math.max(0, 1 - tSince) * 0.7;
        ctx.fillStyle = STATUS.serious;
        ctx.beginPath();
        ctx.arc(site.x, site.y, 14 + tSince * 40, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'tip-over': {
        // The silhouette above already drew upright; overlay a falling bar
        // rotating from the tilt to horizontal over 1.5 s about the base.
        const fall = Math.min(1, tSince / 1.5);
        const ang = (Math.PI / 2) * fall;
        const len = Math.max(16, 12 / cam.metersPerPx);
        ctx.strokeStyle = STATUS.critical;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(site.x, site.y);
        ctx.lineTo(site.x + Math.sin(ang) * len, site.y - Math.cos(ang) * len);
        ctx.stroke();
        break;
      }
      case 'missed-pad': {
        // Dashed line pad → touchdown point with the miss distance labelled.
        ctx.strokeStyle = STATUS.warning;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(pad.x, pad.y);
        ctx.lineTo(site.x, site.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = STATUS.warning;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(
          `${Math.abs(sample.northM).toFixed(0)} m`,
          (pad.x + site.x) / 2 + 6,
          (pad.y + site.y) / 2 - 6,
        );
        ctx.globalAlpha = 1;
        break;
      }
      case 'rud': {
        // Expanding burst + 12 debris shards on fixed deterministic angles.
        const r = 8 + tSince * 90;
        ctx.globalAlpha = Math.max(0, 1 - tSince / 1.6);
        ctx.fillStyle = STATUS.serious;
        ctx.beginPath();
        ctx.arc(site.x, site.y, r * 0.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = STATUS.critical;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const th = (i / 12) * 2 * Math.PI;
          const rr = r * (0.7 + 0.3 * ((i * 7) % 5) / 5); // fixed per-shard spread
          ctx.beginPath();
          ctx.moveTo(site.x + Math.cos(th) * r * 0.3, site.y + Math.sin(th) * r * 0.3);
          ctx.lineTo(site.x + Math.cos(th) * rr, site.y + Math.sin(th) * rr);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'no-touchdown':
        break; // banner chip suffices
    }
  }
```

Also, for `rud` and the `out-of-propellant` case, suppress the normal rocket silhouette: wrap the whole "Rocket silhouette" section (from `const pos = worldToScreen(...)` through `ctx.restore()`) in:

```ts
  const destroyed = touchdown !== null && touchdown.verdict.kind === 'rud' && touchdown.tSince > 0.1;
  if (!destroyed) {
    // ...existing silhouette drawing...
  }
```

- [ ] **Step 2: Verify tests still pass + eyeball each verdict**

Run: `npm run test -w web`
Expected: PASS.

Run: `npm run dev:web` and force each failure visually: drag to a red cell and Launch (expect RUD or out-of-propellant depending on the cell); pick an amber cell (missed-pad); the success pulse on a green cell. Tip-over/hard-landing may need edge-of-region cells. Confirm each verdict shows its distinct animation; stop the server.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/landing-sim/LandingCanvas.tsx
git commit -m "feat(web): distinct deterministic failure-mode visuals at touchdown"
```

---

### Task 13: Final verification + defaults tuning

**Files:**
- Possibly modify: `apps/web/src/features/landing-sim/EntryPointSelector.tsx` (`ENTRY_RANGES`), `LandingSimView.tsx` (`DEFAULT_INPUTS`), `data/reference-tvc-booster.rocket.yaml` (`entry_burn` values) — tuning only.

- [ ] **Step 1: Full test suite**

Run: `npm test` then `npm run test -w web`
Expected: everything PASS (318 pre-existing + ~25 new).

- [ ] **Step 2: Production build**

Run: `npm run build:web`
Expected: tsc clean, vite build succeeds.

- [ ] **Step 3: Capture-region sanity tune**

Run `npm run dev:web`, open D · Landing, wait for the sweep. Requirement: the default grid must show a visible green island (≥ ~10% of cells) with the default γ/downrange, and `DEFAULT_INPUTS` must sit on or beside it. If it doesn't: adjust, in order, (1) `entry_burn.target_speed_mps` in the YAML (300 → 250 or 350), (2) `entry_burn.ignite_altitude_m` (12000 → 10000/15000), (3) `DEFAULT_INPUTS.propellantKg` (1500 → 1200/2000; remember T/W: 50 kN needs total mass < ~4.4 t to hover), (4) `ENTRY_RANGES` bounds. Re-run `npm test` after any YAML change (the yaml is only asserted through the loader defaults — Task 1's tests use their own yaml — but confirm anyway).

- [ ] **Step 4: Commit any tuning + close out**

```bash
git add -A
git commit -m "feat(web): tune landing-sim defaults for a healthy default capture region"
```

(Skip the commit if nothing was tuned.)

- [ ] **Step 5: Report**

Summarize: tests added/passing, the build status, and anything tuned in Step 3 — then hand back for review.

---

## Self-review notes (already applied)

- **Spec coverage:** §2 decisions → Tasks 4/7/11 (tab, warp, playback); §3 architecture → Tasks 5/7/11; §4 guidance + config → Tasks 1–3; §5 files → Tasks 4–11 (file-for-file); §6 camera/canvas → Task 8; §7 HUD/verdict/failure visuals → Tasks 6/9/12; §8 testing → Tasks 1–3/6/7/8/11; §9 build order preserved; §10 constraints in Global Constraints. Stretch items (two-pane view, replay UI beyond seek) intentionally absent per spec §9.7.
- **Type consistency:** `EntryScenario`/`runEntryDescentSim` (Tasks 2→5), `CaptureOutcome` declared in `simWorker.ts` and re-exported by feature types (Task 5 Step 1), `PlaybackSample` (Tasks 7→8/9), `PhaseTimes` structural match to `EntryRunResult` (Task 11 note), `TouchdownVisual` (Tasks 8→11→12).
- **Known risk, handled in-plan:** physical closure of the test scenarios (Task 3 Step 2) and of the UI default envelope (Task 13 Step 3) have explicit, ordered tuning instructions that never touch guidance source.
