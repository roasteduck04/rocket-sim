# Rocket Design Studio — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a thin end-to-end slice of the Phase 9 rocket design studio: assemble a finned hobby rocket from a component tree, generate the sim's input artifacts (mass properties, Barrowman aero table, thrust curve), and "Fly it" through the *existing, unmodified* 6-DOF sim — validated against OpenRocket's Estes Alpha III.

**Architecture:** A new pure-TS package `packages/rocket-design` computes parametric part mass/CG/inertia (→ `MassConfig`), subsonic Barrowman aero + drag (→ the 11-column aero table + a `cpFromNoseM`), and parses motor `.eng` files, then assembles a `RocketConfig` in the exact types `@fds/rocket-sim` already loads. A new `apps/web` feature `design-studio` edits the design in a `Tree`, shows a live CP/CG schematic, and runs `runRocketSim(cfg, openLoopAscent(cfg))` on the main thread. `packages/rocket-sim` and `packages/physics-core` are **not** modified, so golden runs stay green by construction.

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`, `.js` import specifiers), Vitest, React 19 + Vite, the Phase 8 UI kit (`apps/web/src/ui`), `@fds/physics-core` math.

## Global Constraints

- **Never modify `packages/rocket-sim/**` or `packages/physics-core/**`** — the studio only *consumes* their public API and produces their input types. Any temptation to edit them is a plan failure; adapt in `rocket-design` instead.
- **`npm run test` golden runs (`tests/golden-runs/`, `tests/validation/`) must stay green** unchanged.
- **Package code style:** ESM with explicit `.js` import extensions (e.g. `from './components.js'`); `import type { … }` for type-only imports (`verbatimModuleSyntax` + `isolatedModules` are on); `strict` TypeScript; no DOM in `packages/*`.
- **Package naming:** `@fds/rocket-design`, `"type": "module"`, entry `./src/index.ts` (mirror `packages/rocket-sim/package.json`).
- **SI units, radians** internally (angles in radians unless a field name says `_deg`), matching `@fds/rocket-sim`.
- **Tests live in the root `tests/` tree** (`tests/unit/**`, `tests/validation/**`); vitest glob is `tests/**/*.test.ts`. Web tests live in `apps/web/tests/` and run via `npm run test:web`.
- **Commit style:** small, frequent; author is the repo default (`roasteduck04`); **no Claude/co-author trailers**.
- **UI:** use Phase 8 primitives from `apps/web/src/ui` and tokens (`var(--fd-*)`); no literal colors at call sites.

---

## File Structure

**New package `packages/rocket-design/`:**
- `package.json`, `tsconfig.json` — workspace wiring (mirror `rocket-sim`).
- `src/materials.ts` — curated density table + lookup.
- `src/components.ts` — parametric part types, `RocketDesign`, the Alpha III preset.
- `src/massModel.ts` — per-part mass/CG/axial+transverse inertia; assembly → dry mass props.
- `src/motors.ts` — RASP `.eng` parser (metadata + curve) → `Motor`.
- `src/barrowman.ts` — subsonic component CNα/CP → `CN(α)`, `cpFromNoseM`, static margin.
- `src/drag.ts` — subsonic zero-lift `CD0` buildup.
- `src/aeroTable.ts` — sample barrowman+drag over a Mach×AoA grid → `AeroRow[][]` + CSV.
- `src/buildConfig.ts` — `buildRocketConfig(design, motor) → RocketConfig` (the bridge).
- `src/index.ts` — barrel.

**New data:**
- `data/motors/Estes_A8.eng`, `Estes_B6.eng`, `Estes_C6.eng` — curated RASP snapshots.

**New web feature `apps/web/src/features/design-studio/`:**
- `designModel.ts` — editable `RocketDesign` reducer + Alpha III default + localStorage.
- `ComponentTree.tsx` — `<Tree>` over the design (add/remove/reorder).
- `PartInspector.tsx` — per-part `NumberField`/`Select` form.
- `Schematic.tsx` — side-view SVG + CP/CG markers + margin.
- `MotorPicker.tsx` — `Select` over the curated motors + thrust preview.
- `flyIt.ts` — build config + `runRocketSim` (main thread) → telemetry/summary.
- `DesignStudioView.tsx` — the workspace that wires it together.
- `design-studio.css` — layout (token-driven).

**Modified (web only):**
- `apps/web/src/shell/nav.ts` — enable the `studio` destination.
- `apps/web/src/App.tsx` — mount `DesignStudioView` for the `studio` view id.
- `vitest.config.ts`, root `tsconfig.json`, `apps/web/tsconfig.json` — add the `@fds/rocket-design` alias/path.

---

## Task 1: Scaffold `@fds/rocket-design` and wire it into the workspace

**Files:**
- Create: `packages/rocket-design/package.json`
- Create: `packages/rocket-design/tsconfig.json`
- Create: `packages/rocket-design/src/index.ts`
- Modify: `vitest.config.ts` (add alias)
- Modify: `tsconfig.json` (add path)
- Modify: `apps/web/tsconfig.json` (add path)
- Test: `tests/unit/rocket-design/scaffold.test.ts`

**Interfaces:**
- Produces: the importable package `@fds/rocket-design` with a barrel `src/index.ts`.

- [ ] **Step 1: Create the package manifest** — `packages/rocket-design/package.json`:

```json
{
  "name": "@fds/rocket-design",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@fds/physics-core": "*",
    "@fds/rocket-sim": "*"
  }
}
```

- [ ] **Step 2: Create `packages/rocket-design/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@fds/physics-core": ["../physics-core/src/index.ts"],
      "@fds/rocket-sim": ["../rocket-sim/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create a placeholder barrel** — `packages/rocket-design/src/index.ts`:

```ts
/**
 * @fds/rocket-design — the parametric rocket design studio core. Generates the
 * mass properties, Barrowman aero table, and thrust curve that @fds/rocket-sim
 * consumes, so the 6-DOF core stays untouched (Phase 9, finalproductroadmap).
 */
export const PACKAGE = '@fds/rocket-design';
```

- [ ] **Step 4: Register the alias in `vitest.config.ts`** — add to the `resolve.alias` object, after the `@fds/reentry-sim` line:

```ts
      '@fds/rocket-design': r('./packages/rocket-design/src/index.ts'),
```

- [ ] **Step 5: Register the path in root `tsconfig.json`** — add to `compilerOptions.paths`, after the `@fds/reentry-sim` entry:

```json
      "@fds/rocket-design": ["packages/rocket-design/src/index.ts"],
```

- [ ] **Step 6: Register the path in `apps/web/tsconfig.json`** — open it; if it has a `compilerOptions.paths` block with the other `@fds/*` entries, add:

```json
      "@fds/rocket-design": ["../../packages/rocket-design/src/index.ts"],
```

(Match the exact relative prefix the sibling `@fds/*` entries already use in that file.)

- [ ] **Step 7: Install workspaces** so npm links the new package:

Run: `npm install`
Expected: completes; `node_modules/@fds/rocket-design` symlink exists.

- [ ] **Step 8: Write the failing scaffold test** — `tests/unit/rocket-design/scaffold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PACKAGE } from '@fds/rocket-design';

describe('rocket-design scaffold', () => {
  it('resolves the workspace package', () => {
    expect(PACKAGE).toBe('@fds/rocket-design');
  });
});
```

- [ ] **Step 9: Run it** — `npm run test -- tests/unit/rocket-design/scaffold.test.ts`
Expected: PASS (1 test). If the alias is wrong the import fails to resolve — fix the alias/path.

- [ ] **Step 10: Commit**

```bash
git add packages/rocket-design vitest.config.ts tsconfig.json apps/web/tsconfig.json tests/unit/rocket-design package-lock.json
git commit -m "feat(rocket-design): scaffold @fds/rocket-design package"
```

---

## Task 2: Materials table and component model

**Files:**
- Create: `packages/rocket-design/src/materials.ts`
- Create: `packages/rocket-design/src/components.ts`
- Modify: `packages/rocket-design/src/index.ts` (export the new modules)
- Test: `tests/unit/rocket-design/components.test.ts`

**Interfaces:**
- Produces:
  - `type MaterialId = 'balsa' | 'plastic' | 'cardstock' | 'kraft-tube' | 'plywood'`
  - `density(id: MaterialId): number` — kg/m³
  - Part types (all stations/lengths in metres, from the nose tip):
    - `interface NoseCone { kind: 'nose'; shape: 'ogive' | 'cone'; lengthM; baseRadiusM; wallThicknessM; material: MaterialId }`
    - `interface BodyTube { kind: 'tube'; lengthM; outerRadiusM; wallThicknessM; material: MaterialId }`
    - `interface FinSet { kind: 'fins'; count; rootChordM; tipChordM; semiSpanM; sweepM; thicknessM; material: MaterialId }` (`sweepM` = axial distance from root LE to tip LE)
    - `interface MassComponent { kind: 'mass'; label: string; massKg; lengthM }` (a lumped internal mass, e.g. recovery wadding/payload)
    - `type Part = NoseCone | BodyTube | FinSet | MassComponent`
  - `interface RocketDesign { name: string; parts: Part[]; motorId: string }` — `parts` are ordered nose→tail; the fin set carries its own station via placement (see massModel). `motorId` selects a curated motor.
  - `ALPHA_III: RocketDesign` — the Estes Alpha III preset.

- [ ] **Step 1: Write `packages/rocket-design/src/materials.ts`:**

```ts
/** Curated material densities, kg/m³ (hobby-rocket build materials). */
export type MaterialId = 'balsa' | 'plastic' | 'cardstock' | 'kraft-tube' | 'plywood';

const DENSITY: Record<MaterialId, number> = {
  balsa: 160,
  plastic: 950,
  cardstock: 700,
  'kraft-tube': 850,
  plywood: 630,
};

export const density = (id: MaterialId): number => DENSITY[id];

export const MATERIALS: MaterialId[] = ['balsa', 'plastic', 'cardstock', 'kraft-tube', 'plywood'];
```

- [ ] **Step 2: Write `packages/rocket-design/src/components.ts`** — the part types, the `RocketDesign`, and the Alpha III preset (dimensions from the published Estes Alpha III / OpenRocket example; confirm against an actual `.ork` during validation in Task 9):

```ts
import type { MaterialId } from './materials.js';

export interface NoseCone {
  kind: 'nose';
  shape: 'ogive' | 'cone';
  lengthM: number;
  baseRadiusM: number;
  wallThicknessM: number;
  material: MaterialId;
}
export interface BodyTube {
  kind: 'tube';
  lengthM: number;
  outerRadiusM: number;
  wallThicknessM: number;
  material: MaterialId;
}
export interface FinSet {
  kind: 'fins';
  count: number;
  rootChordM: number;
  tipChordM: number;
  semiSpanM: number;
  /** Axial distance from the root leading edge to the tip leading edge, m. */
  sweepM: number;
  thicknessM: number;
  material: MaterialId;
}
export interface MassComponent {
  kind: 'mass';
  label: string;
  massKg: number;
  lengthM: number;
}
export type Part = NoseCone | BodyTube | FinSet | MassComponent;

export interface RocketDesign {
  name: string;
  /** Ordered nose → tail. The fin set is mounted at the aft end of the tube it follows. */
  parts: Part[];
  /** Selected curated motor id (Task 4), e.g. 'Estes_C6'. */
  motorId: string;
}

/** Estes Alpha III — the canonical OpenRocket tutorial rocket (BT-50 airframe). */
export const ALPHA_III: RocketDesign = {
  name: 'Estes Alpha III',
  parts: [
    { kind: 'nose', shape: 'ogive', lengthM: 0.064, baseRadiusM: 0.0123, wallThicknessM: 0.0015, material: 'plastic' },
    { kind: 'tube', lengthM: 0.243, outerRadiusM: 0.0123, wallThicknessM: 0.0003, material: 'kraft-tube' },
    { kind: 'fins', count: 3, rootChordM: 0.048, tipChordM: 0.025, semiSpanM: 0.028, sweepM: 0.030, thicknessM: 0.0025, material: 'plastic' },
  ],
  motorId: 'Estes_C6',
};
```

- [ ] **Step 3: Export from the barrel** — replace `packages/rocket-design/src/index.ts` body with:

```ts
/**
 * @fds/rocket-design — parametric rocket design studio core (Phase 9).
 * Generates @fds/rocket-sim inputs; the 6-DOF core stays untouched.
 */
export * from './materials.js';
export * from './components.js';
```

- [ ] **Step 4: Write the failing test** — `tests/unit/rocket-design/components.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALPHA_III, density, MATERIALS } from '@fds/rocket-design';

describe('materials', () => {
  it('returns known densities', () => {
    expect(density('balsa')).toBeGreaterThan(100);
    expect(density('plastic')).toBeGreaterThan(density('balsa'));
    expect(MATERIALS).toContain('kraft-tube');
  });
});

describe('Alpha III preset', () => {
  it('is a nose + tube + 3-fin stack on a C motor', () => {
    const kinds = ALPHA_III.parts.map((p) => p.kind);
    expect(kinds).toEqual(['nose', 'tube', 'fins']);
    const fins = ALPHA_III.parts.find((p) => p.kind === 'fins');
    expect(fins?.kind === 'fins' && fins.count).toBe(3);
    expect(ALPHA_III.motorId).toBe('Estes_C6');
  });
});
```

- [ ] **Step 5: Run** — `npm run test -- tests/unit/rocket-design/components.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src tests/unit/rocket-design/components.test.ts
git commit -m "feat(rocket-design): materials table + parametric component model + Alpha III preset"
```

---

## Task 3: Mass model (per-part mass/CG/inertia → dry mass properties)

**Files:**
- Create: `packages/rocket-design/src/massModel.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/massModel.test.ts`

**Background (conventions to match `@fds/rocket-sim`):** stations are measured from the nose tip, aft positive. The sim's `MassConfig` (see `packages/rocket-sim/src/types.ts`) wants `dryKg`, `dryCgFromNoseM`, and `dryInertiaKgm2 {Ixx,Iyy,Izz}` **about the dry CG**, with `Ixx` axial and `Iyy=Izz` transverse for an axisymmetric vehicle.

**Interfaces:**
- Consumes: `Part`, `RocketDesign` (Task 2), `density` (Task 2).
- Produces:
  - `interface PartMass { massKg: number; cgFromNoseM: number; IxxAboutCg: number; ItransAboutCg: number }`
  - `partMass(part: Part, stationFromNoseM: number): PartMass` — `stationFromNoseM` is the part's leading (fore) station.
  - `interface DryMass { massKg; cgFromNoseM; Ixx; Iyy; Izz }` (inertia about the dry CG)
  - `dryMassProps(design: RocketDesign): DryMass`
  - `partStations(design: RocketDesign): number[]` — fore station of each part (nose at 0; tube after nose; fins mounted at the aft end of the preceding tube), so the UI and Barrowman share one placement rule.

- [ ] **Step 1: Write the failing test first** — `tests/unit/rocket-design/massModel.test.ts` (a hollow tube has an analytic mass and centroid at its mid-length):

```ts
import { describe, expect, it } from 'vitest';
import type { BodyTube } from '@fds/rocket-design';
import { partMass, dryMassProps } from '@fds/rocket-design';
import { ALPHA_III } from '@fds/rocket-design';

describe('partMass — hollow tube', () => {
  const tube: BodyTube = { kind: 'tube', lengthM: 0.2, outerRadiusM: 0.02, wallThicknessM: 0.001, material: 'kraft-tube' };

  it('matches the analytic hollow-cylinder mass and centroid', () => {
    const ro = 0.02, ri = 0.019, L = 0.2, rho = 850;
    const expectedMass = rho * Math.PI * (ro * ro - ri * ri) * L;
    const pm = partMass(tube, 0.05);
    expect(pm.massKg).toBeCloseTo(expectedMass, 6);
    expect(pm.cgFromNoseM).toBeCloseTo(0.05 + L / 2, 6); // centroid at mid-length
  });
});

describe('dryMassProps — Alpha III', () => {
  it('is a light rocket with CG in the aft half', () => {
    const dm = dryMassProps(ALPHA_III);
    expect(dm.massKg).toBeGreaterThan(0.01);
    expect(dm.massKg).toBeLessThan(0.06); // ~34 g airframe
    expect(dm.cgFromNoseM).toBeGreaterThan(0.10);
    expect(dm.cgFromNoseM).toBeLessThan(0.30);
    expect(dm.Iyy).toBeCloseTo(dm.Izz, 12); // axisymmetric
    expect(dm.Iyy).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm it fails** — `npm run test -- tests/unit/rocket-design/massModel.test.ts`
Expected: FAIL ("partMass is not a function").

- [ ] **Step 3: Implement `packages/rocket-design/src/massModel.ts`** (thin-wall shells; balsa/plastic fins as flat plates; parallel-axis to the assembly CG):

```ts
import type { BodyTube, FinSet, MassComponent, NoseCone, Part, RocketDesign } from './components.js';
import { density } from './materials.js';

export interface PartMass {
  massKg: number;
  cgFromNoseM: number;
  /** Axial inertia about the part CG, kg·m². */
  IxxAboutCg: number;
  /** Transverse inertia about the part CG (about a lateral axis through the CG), kg·m². */
  ItransAboutCg: number;
}

const tubeMass = (t: BodyTube): PartMass & { L: number } => {
  const ro = t.outerRadiusM;
  const ri = Math.max(0, ro - t.wallThicknessM);
  const L = t.lengthM;
  const m = density(t.material) * Math.PI * (ro * ro - ri * ri) * L;
  // Thin-wall cylinder about its own centroid.
  const Ixx = 0.5 * m * (ro * ro + ri * ri);
  const Itrans = (m / 12) * (3 * (ro * ro + ri * ri) + L * L);
  return { massKg: m, cgFromNoseM: L / 2, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L };
};

const noseMass = (n: NoseCone): PartMass & { L: number } => {
  // Thin shell approximated as a cone frustum of slant surface: mass ≈ ρ·t·A_surface.
  const R = n.baseRadiusM;
  const L = n.lengthM;
  const slant = Math.hypot(R, L);
  const area = Math.PI * R * slant; // lateral surface of a cone
  const m = density(n.material) * n.wallThicknessM * area;
  // Solid-cone CG is 3/4·L from the tip; a thin conical shell is 2/3·L. Use shell.
  const cg = (2 / 3) * L;
  // Coarse inertia (thin cone shell): axial ≈ ½·m·R²; transverse ≈ m·(R²/4 + L²/18).
  const Ixx = 0.5 * m * R * R;
  const Itrans = m * (R * R / 4 + L * L / 18);
  return { massKg: m, cgFromNoseM: cg, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L };
};

const finSetMass = (f: FinSet): PartMass & { L: number } => {
  // Flat trapezoidal plates. Planform area of one fin:
  const area = 0.5 * (f.rootChordM + f.tipChordM) * f.semiSpanM;
  const oneMass = density(f.material) * f.thicknessM * area;
  const m = oneMass * f.count;
  // Chordwise centroid of a trapezoid from the root LE:
  const cgChord =
    (f.rootChordM + 2 * f.tipChordM) / (3 * (f.rootChordM + f.tipChordM)) * f.sweepM +
    (f.rootChordM * f.rootChordM + f.rootChordM * f.tipChordM + f.tipChordM * f.tipChordM) /
      (3 * (f.rootChordM + f.tipChordM));
  // Coarse: treat the fin ring inertia as plates at the body radius; small vs body — approximate.
  const Ixx = m * (f.semiSpanM * f.semiSpanM) / 3; // fins spread radially
  const Itrans = m * (f.rootChordM * f.rootChordM) / 12;
  return { massKg: m, cgFromNoseM: cgChord, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L: f.rootChordM };
};

/** Mass properties of one part, given its fore (leading) station from the nose. */
export const partMass = (part: Part, stationFromNoseM: number): PartMass => {
  let base: PartMass & { L: number };
  switch (part.kind) {
    case 'tube': base = tubeMass(part); break;
    case 'nose': base = noseMass(part); break;
    case 'fins': base = finSetMass(part); break;
    case 'mass': {
      const p = part as MassComponent;
      base = { massKg: p.massKg, cgFromNoseM: p.lengthM / 2, IxxAboutCg: 0, ItransAboutCg: 0, L: p.lengthM };
      break;
    }
  }
  return {
    massKg: base.massKg,
    cgFromNoseM: stationFromNoseM + base.cgFromNoseM,
    IxxAboutCg: base.IxxAboutCg,
    ItransAboutCg: base.ItransAboutCg,
  };
};

/** Fore station of each part: nose at 0, tubes/masses stack in order; a fin set
 *  mounts at the aft end of the preceding tube (its own length not added to the stack). */
export const partStations = (design: RocketDesign): number[] => {
  const stations: number[] = [];
  let x = 0;
  let lastTubeAft = 0;
  for (const part of design.parts) {
    if (part.kind === 'fins') {
      // Mount so the fin ROOT trailing edge sits at the aft end of the last tube.
      stations.push(lastTubeAft - part.rootChordM);
      continue;
    }
    stations.push(x);
    const len = part.kind === 'nose' ? part.lengthM : part.kind === 'tube' ? part.lengthM : part.lengthM;
    x += len;
    if (part.kind === 'tube') lastTubeAft = x;
  }
  return stations;
};

export interface DryMass {
  massKg: number;
  cgFromNoseM: number;
  Ixx: number;
  Iyy: number;
  Izz: number;
}

/** Assemble dry mass, CG (from nose), and the inertia tensor about the dry CG. */
export const dryMassProps = (design: RocketDesign): DryMass => {
  const stations = partStations(design);
  const pms = design.parts.map((p, i) => partMass(p, stations[i]));
  const massKg = pms.reduce((s, p) => s + p.massKg, 0);
  const cg = pms.reduce((s, p) => s + p.massKg * p.cgFromNoseM, 0) / massKg;
  let Ixx = 0;
  let Itrans = 0;
  for (const p of pms) {
    const d = p.cgFromNoseM - cg;
    Ixx += p.IxxAboutCg;
    Itrans += p.ItransAboutCg + p.massKg * d * d; // parallel axis to the dry CG
  }
  return { massKg, cgFromNoseM: cg, Ixx, Iyy: Itrans, Izz: Itrans };
};
```

- [ ] **Step 4: Export** — add to `packages/rocket-design/src/index.ts`:

```ts
export * from './massModel.js';
```

- [ ] **Step 5: Run the test** — `npm run test -- tests/unit/rocket-design/massModel.test.ts`
Expected: PASS (2 tests). If the Alpha III mass falls outside 10–60 g, adjust the preset wall thicknesses in Task 2 (the numbers approximate a 34 g airframe).

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src/massModel.ts packages/rocket-design/src/index.ts tests/unit/rocket-design/massModel.test.ts
git commit -m "feat(rocket-design): parametric mass/CG/inertia model"
```

---

## Task 4: Motor `.eng` parser + curated Estes motors

**Files:**
- Create: `data/motors/Estes_A8.eng`, `data/motors/Estes_B6.eng`, `data/motors/Estes_C6.eng`
- Create: `packages/rocket-design/src/motors.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/motors.test.ts`

**Background:** RASP `.eng` format — a header line `name diameter(mm) length(mm) delays propellantWeight(kg) totalWeight(kg) manufacturer`, then `time thrust` pairs, terminated by a `;` comment convention. `@fds/rocket-sim`'s `loadThrustCurve` (`packages/rocket-sim/src/propulsion.ts`) already parses the `time thrust` pairs (it skips the header + `;` comments). This task adds the **header** parse for mass/geometry and wraps the curve.

**Interfaces:**
- Consumes: `loadThrustCurve` from `@fds/rocket-sim`.
- Produces:
  - `interface Motor { id: string; designation: string; diameterM; lengthM; propellantKg; totalKg; thrustCurve: ThrustCurve; totalImpulseNs: number; impulseClass: string; avgThrustN: number; burnTimeS: number }`
  - `parseEng(id: string, text: string): Motor`
  - `impulseClassOf(totalImpulseNs: number): string` — the NAR letter class (…, 'A', 'B', 'C', …)

- [ ] **Step 1: Add the curated motor files.** `data/motors/Estes_C6.eng` (real published RASP data):

```
; Estes C6 — 18mm black-powder motor (RASP snapshot)
C6 18 70 3-5-7 0.0108 0.0242 Estes
0.031 0.946
0.092 4.826
0.139 9.936
0.192 14.09
0.209 11.446
0.231 7.381
0.288 6.151
0.352 5.489
0.489 4.921
0.699 4.446
1.010 4.258
1.219 4.542
1.398 4.164
1.646 4.448
1.850 2.877
1.900 1.230
1.958 0.478
2.000 0.000
;
```

`data/motors/Estes_B6.eng`:

```
; Estes B6 — 18mm black-powder motor (RASP snapshot)
B6 18 70 2-4-6 0.0062 0.0197 Estes
0.023 0.740
0.057 2.703
0.089 5.000
0.116 7.404
0.148 9.419
0.171 11.242
0.191 12.898
0.200 11.081
0.209 7.385
0.230 5.000
0.255 4.019
0.305 3.571
0.375 3.220
0.477 3.041
0.580 2.966
0.720 2.966
0.860 2.966
0.930 1.503
0.976 0.000
;
```

`data/motors/Estes_A8.eng`:

```
; Estes A8 — 18mm black-powder motor (RASP snapshot)
A8 18 70 3-5 0.0031 0.0164 Estes
0.021 0.481
0.056 1.503
0.093 2.965
0.124 4.427
0.153 5.929
0.181 7.351
0.202 8.052
0.219 6.510
0.240 3.687
0.261 2.165
0.286 1.503
0.330 1.062
0.395 0.881
0.475 0.700
0.575 0.601
0.650 0.000
;
```

- [ ] **Step 2: Write the failing test** — `tests/unit/rocket-design/motors.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEng, impulseClassOf } from '@fds/rocket-design';

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../data/motors/${name}`, import.meta.url)), 'utf8');

describe('parseEng — Estes C6', () => {
  const motor = parseEng('Estes_C6', read('Estes_C6.eng'));

  it('reads the header metadata', () => {
    expect(motor.designation).toBe('C6');
    expect(motor.diameterM).toBeCloseTo(0.018, 6);
    expect(motor.propellantKg).toBeCloseTo(0.0108, 6);
    expect(motor.totalKg).toBeCloseTo(0.0242, 6);
  });

  it('has a C-class total impulse (~10 N·s) and a burn ~2 s', () => {
    expect(motor.totalImpulseNs).toBeGreaterThan(8);
    expect(motor.totalImpulseNs).toBeLessThan(12);
    expect(motor.impulseClass).toBe('C');
    expect(motor.burnTimeS).toBeCloseTo(2.0, 1);
  });
});

describe('impulseClassOf', () => {
  it('maps impulse to NAR letters', () => {
    expect(impulseClassOf(2.4)).toBe('A');
    expect(impulseClassOf(4.9)).toBe('B');
    expect(impulseClassOf(9.9)).toBe('C');
  });
});
```

- [ ] **Step 3: Run to confirm failure** — `npm run test -- tests/unit/rocket-design/motors.test.ts`
Expected: FAIL ("parseEng is not a function").

- [ ] **Step 4: Implement `packages/rocket-design/src/motors.ts`:**

```ts
import { loadThrustCurve } from '@fds/rocket-sim';
import type { ThrustCurve } from '@fds/rocket-sim';

export interface Motor {
  id: string;
  designation: string;
  diameterM: number;
  lengthM: number;
  propellantKg: number;
  totalKg: number;
  thrustCurve: ThrustCurve;
  totalImpulseNs: number;
  avgThrustN: number;
  burnTimeS: number;
  impulseClass: string;
}

/** NAR impulse class: A ≤ 2.5, B ≤ 5, C ≤ 10, … each letter doubles. */
export const impulseClassOf = (impulseNs: number): string => {
  if (impulseNs <= 0.3125) return '¼A';
  const letters = 'ABCDEFGHIJKLMNO';
  // Class A upper bound is 2.5 N·s; each subsequent letter doubles.
  let hi = 2.5;
  for (let i = 0; i < letters.length; i++) {
    if (impulseNs <= hi) return letters[i];
    hi *= 2;
  }
  return letters[letters.length - 1];
};

const trapz = (t: number[], f: number[]): number => {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += 0.5 * (f[i] + f[i - 1]) * (t[i] - t[i - 1]);
  return s;
};

export const parseEng = (id: string, text: string): Motor => {
  // Header = the first non-comment, non-blank line whose first token is NON-numeric.
  let header: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (Number.isNaN(Number(parts[0]))) { header = parts; break; }
  }
  if (!header || header.length < 7) throw new Error(`.eng ${id}: missing/short header line`);
  const [designation, diaMm, lenMm, , propKg, totalKg] = header;

  const thrustCurve: ThrustCurve = loadThrustCurve(text);
  const totalImpulseNs = trapz(thrustCurve.time, thrustCurve.thrust);
  const burnTimeS = thrustCurve.time[thrustCurve.time.length - 1];
  return {
    id,
    designation,
    diameterM: Number(diaMm) / 1000,
    lengthM: Number(lenMm) / 1000,
    propellantKg: Number(propKg),
    totalKg: Number(totalKg),
    thrustCurve,
    totalImpulseNs,
    avgThrustN: totalImpulseNs / burnTimeS,
    burnTimeS,
    impulseClass: impulseClassOf(totalImpulseNs),
  };
};
```

- [ ] **Step 5: Export** — add `export * from './motors.js';` to `packages/rocket-design/src/index.ts`.

- [ ] **Step 6: Run** — `npm run test -- tests/unit/rocket-design/motors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add data/motors packages/rocket-design/src/motors.ts packages/rocket-design/src/index.ts tests/unit/rocket-design/motors.test.ts
git commit -m "feat(rocket-design): RASP .eng motor parser + curated Estes A8/B6/C6"
```

---

## Task 5: Subsonic Barrowman aero (CNα, CP, static margin)

**Files:**
- Create: `packages/rocket-design/src/barrowman.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/barrowman.test.ts`

**Background — classic subsonic Barrowman (all CNα per radian, referenced to the body cross-section area `A_ref = π·R_body²`):**
- Nose: `CNα_nose = 2`. CP from nose tip: cone `0.666·L`, ogive `0.466·L`.
- Cylindrical body: `CNα ≈ 0` (Barrowman; body-lift refinement deferred).
- Fin set (`N` fins, one body radius `R` at the fins): with mid-chord span line `l_m = sqrt(semiSpan² + (sweep + (tipChord−rootChord)/2)²)`:
  - `CNα_fins = K_fb · (4·N·(semiSpan/(2R))²) / (1 + sqrt(1 + (2·l_m/(rootChord+tipChord))²))`
  - Body-interference factor `K_fb = 1 + R/(semiSpan + R)`.
  - Fin CP from the fin-root LE: `X_f = (sweep/3)·((rootChord+2·tipChord)/(rootChord+tipChord)) + (1/6)·((rootChord+tipChord) − rootChord·tipChord/(rootChord+tipChord))`.
- Assembly: `CNα = Σ CNα_i`; `X_cp = Σ(CNα_i·X_i)/Σ CNα_i` (stations from the nose tip).
- Static margin (calibers) = `(X_cp − X_cg)/(2·R_body)`.

**Interfaces:**
- Consumes: `RocketDesign`, `NoseCone`, `FinSet` (Task 2); `partStations` (Task 3).
- Produces:
  - `interface AeroBuildup { CNalpha: number; cpFromNoseM: number; refRadiusM: number; refAreaM2: number }`
  - `barrowman(design: RocketDesign): AeroBuildup`
  - `staticMarginCal(design: RocketDesign, cgFromNoseM: number): number`

- [ ] **Step 1: Write the failing test** — `tests/unit/rocket-design/barrowman.test.ts` (a hand-worked ogive-nose + fin example; and the Alpha III CP lands in the aft third):

```ts
import { describe, expect, it } from 'vitest';
import { ALPHA_III, barrowman, dryMassProps, staticMarginCal } from '@fds/rocket-design';

describe('barrowman — Alpha III', () => {
  it('gives CNα > 2 (nose + fins) and CP aft of mid-body', () => {
    const b = barrowman(ALPHA_III);
    expect(b.CNalpha).toBeGreaterThan(2); // nose (2) + fin contribution
    expect(b.CNalpha).toBeLessThan(30);
    expect(b.cpFromNoseM).toBeGreaterThan(0.15);
    expect(b.cpFromNoseM).toBeLessThan(0.31);
  });

  it('yields a positive, stable static margin about the dry CG', () => {
    const dm = dryMassProps(ALPHA_III);
    const margin = staticMarginCal(ALPHA_III, dm.cgFromNoseM);
    expect(margin).toBeGreaterThan(0.5); // stable
    expect(margin).toBeLessThan(4);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test -- tests/unit/rocket-design/barrowman.test.ts`
Expected: FAIL ("barrowman is not a function").

- [ ] **Step 3: Implement `packages/rocket-design/src/barrowman.ts`:**

```ts
import type { FinSet, NoseCone, RocketDesign } from './components.js';
import { partStations } from './massModel.js';

export interface AeroBuildup {
  /** Total normal-force slope, per radian, referenced to the body cross-section. */
  CNalpha: number;
  cpFromNoseM: number;
  refRadiusM: number;
  refAreaM2: number;
}

const bodyRadius = (design: RocketDesign): number => {
  for (const p of design.parts) {
    if (p.kind === 'tube') return p.outerRadiusM;
    if (p.kind === 'nose') return p.baseRadiusM;
  }
  return 0.012;
};

const noseTerm = (n: NoseCone): { cna: number; cpFromForeM: number } => ({
  cna: 2,
  cpFromForeM: (n.shape === 'cone' ? 0.666 : 0.466) * n.lengthM,
});

const finTerm = (f: FinSet, R: number): { cna: number; cpFromRootLeM: number } => {
  const cr = f.rootChordM, ct = f.tipChordM, s = f.semiSpanM;
  const lm = Math.hypot(s, f.sweepM + (ct - cr) / 2);
  const Kfb = 1 + R / (s + R);
  const cna = (Kfb * (4 * f.count * (s / (2 * R)) ** 2)) / (1 + Math.sqrt(1 + (2 * lm / (cr + ct)) ** 2));
  const cpFromRootLeM =
    (f.sweepM / 3) * ((cr + 2 * ct) / (cr + ct)) +
    (1 / 6) * (cr + ct - (cr * ct) / (cr + ct));
  return { cna, cpFromRootLeM };
};

export const barrowman = (design: RocketDesign): AeroBuildup => {
  const R = bodyRadius(design);
  const stations = partStations(design);
  let cnaSum = 0;
  let momentSum = 0; // Σ CNα_i · X_i
  design.parts.forEach((part, i) => {
    const fore = stations[i];
    if (part.kind === 'nose') {
      const { cna, cpFromForeM } = noseTerm(part);
      cnaSum += cna;
      momentSum += cna * (fore + cpFromForeM);
    } else if (part.kind === 'fins') {
      const { cna, cpFromRootLeM } = finTerm(part, R);
      cnaSum += cna;
      momentSum += cna * (fore + cpFromRootLeM);
    }
  });
  const cpFromNoseM = cnaSum > 0 ? momentSum / cnaSum : 0;
  return { CNalpha: cnaSum, cpFromNoseM, refRadiusM: R, refAreaM2: Math.PI * R * R };
};

export const staticMarginCal = (design: RocketDesign, cgFromNoseM: number): number => {
  const b = barrowman(design);
  return (b.cpFromNoseM - cgFromNoseM) / (2 * b.refRadiusM);
};
```

- [ ] **Step 4: Export** — add `export * from './barrowman.js';` to the barrel.

- [ ] **Step 5: Run** — `npm run test -- tests/unit/rocket-design/barrowman.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src/barrowman.ts packages/rocket-design/src/index.ts tests/unit/rocket-design/barrowman.test.ts
git commit -m "feat(rocket-design): subsonic Barrowman CNα/CP + static margin"
```

---

## Task 6: Subsonic drag buildup (CD0)

**Files:**
- Create: `packages/rocket-design/src/drag.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/drag.test.ts`

**Background:** a coarse but physical subsonic zero-lift drag buildup, referenced to `A_ref`: turbulent skin friction over the wetted area (`Cf ≈ 0.074·Re^-0.2`, `Re` on body length), plus base drag (`≈ 0.12·A_base/A_ref`), plus a fin profile term. Sufficient for an apogee cross-check within ±10–15%; refinement (Reynolds roughness cutoff, transonic rise) is deferred.

**Interfaces:**
- Consumes: `RocketDesign`, `barrowman` (for `refAreaM2`/`refRadiusM`), part geometry.
- Produces: `cd0(design: RocketDesign, mach: number, altitudeM?: number): number`

- [ ] **Step 1: Write the failing test** — `tests/unit/rocket-design/drag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALPHA_III, cd0 } from '@fds/rocket-design';

describe('cd0 — Alpha III subsonic', () => {
  it('is a plausible model-rocket drag coefficient', () => {
    const cd = cd0(ALPHA_III, 0.1);
    expect(cd).toBeGreaterThan(0.2);
    expect(cd).toBeLessThan(0.9);
  });
  it('is finite and positive across the subsonic range', () => {
    for (const m of [0.05, 0.2, 0.5, 0.8]) {
      const cd = cd0(ALPHA_III, m);
      expect(Number.isFinite(cd)).toBe(true);
      expect(cd).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test -- tests/unit/rocket-design/drag.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/rocket-design/src/drag.ts`:**

```ts
import { atmosphere } from '@fds/atmosphere-models';
import type { FinSet, RocketDesign } from './components.js';
import { barrowman } from './barrowman.js';

const bodyLengthM = (design: RocketDesign): number =>
  design.parts.reduce((s, p) => s + (p.kind === 'nose' || p.kind === 'tube' ? p.lengthM : 0), 0);

const wettedBodyAreaM2 = (design: RocketDesign, R: number): number => {
  let a = 0;
  for (const p of design.parts) {
    if (p.kind === 'tube') a += 2 * Math.PI * p.outerRadiusM * p.lengthM;
    if (p.kind === 'nose') a += Math.PI * p.baseRadiusM * Math.hypot(p.baseRadiusM, p.lengthM);
  }
  return a || 2 * Math.PI * R * bodyLengthM(design);
};

/** Zero-lift drag coefficient referenced to the body cross-section area. */
export const cd0 = (design: RocketDesign, mach: number, altitudeM = 0): number => {
  const b = barrowman(design);
  const R = b.refRadiusM;
  const Aref = b.refAreaM2;
  const L = Math.max(bodyLengthM(design), 1e-3);
  const atmo = atmosphere(altitudeM);
  const V = Math.max(mach * atmo.a, 1); // avoid Re→0 at rest
  const nu = 1.5e-5; // kinematic viscosity of air, m²/s (sea-level ballpark)
  const Re = Math.max((V * L) / nu, 1e4);
  const Cf = 0.074 * Re ** -0.2; // turbulent flat-plate

  const Awet = wettedBodyAreaM2(design, R);
  const friction = Cf * (Awet / Aref);

  // Base drag: the blunt tail behind the body.
  const base = 0.12; // ≈ 0.12·(A_base/A_ref); A_base ≈ A_ref for a straight tube

  // Fin profile drag (thin plates), referenced to A_ref.
  const fins = design.parts.find((p): p is FinSet => p.kind === 'fins');
  let finDrag = 0;
  if (fins) {
    const planform = 0.5 * (fins.rootChordM + fins.tipChordM) * fins.semiSpanM * fins.count;
    finDrag = 2 * Cf * (planform / Aref); // two wetted sides
  }
  return friction + base + finDrag;
};
```

- [ ] **Step 4: Export** — add `export * from './drag.js';` to the barrel. (Add `@fds/atmosphere-models` to `packages/rocket-design/package.json` dependencies as `"*"` and to its `tsconfig.json` paths, then re-run `npm install`.)

- [ ] **Step 5: Run** — `npm run test -- tests/unit/rocket-design/drag.test.ts`
Expected: PASS (2 tests). If `cd0` at Mach 0.1 exceeds 0.9, reduce the `base` term or verify wetted-area units.

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src/drag.ts packages/rocket-design/src/index.ts packages/rocket-design/package.json packages/rocket-design/tsconfig.json package-lock.json tests/unit/rocket-design/drag.test.ts
git commit -m "feat(rocket-design): subsonic zero-lift drag buildup"
```

---

## Task 7: Aero-table generation (Mach × AoA grid → 11-column table)

**Files:**
- Create: `packages/rocket-design/src/aeroTable.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/aeroTable.test.ts`

**Background — the sim's table columns (see `packages/rocket-sim/src/aero.ts`):** `Mach, AoA_deg, CA, CN, Cm, CY, Cl, Cn, Clp, Cmq, Cnr`. For this slice: `CA = cd0(mach)` (axial ≈ zero-lift drag at small α); `CN = CNα·α_rad` (linear); `Cm = Cn = 0` (restoring is geometric via CP−CG in the sim); `CY` is derived by the sim from the CN curve, so the table's `CY` column is 0; `Cl = 0`; damping `Clp, Cmq, Cnr` are small negative estimates (see below). The grid must be **complete and rectangular** — `loadAeroTable` throws on a missing node.

**Damping estimates (coarse; apogee is insensitive to these — they only damp oscillation):** `Cmq = Cnr = −2·CNα_fins·((X_fin − X_cg)/d)²` clamped to `[-40, -0.5]`; `Clp = -0.01`. For the slice, a fixed conservative `Cmq = Cnr = -8`, `Clp = -0.01` is acceptable; use the fixed values to keep the table generator simple and note the refinement.

**Interfaces:**
- Consumes: `barrowman`, `cd0` (Tasks 5–6).
- Produces:
  - `interface AeroTableSpec { machGrid: number[]; aoaDegGrid: number[] }`
  - `DEFAULT_GRID: AeroTableSpec` (Mach `[0, 0.1, 0.3, 0.5, 0.7, 0.9]`, AoA `[0, 2, 5, 10, 15]`)
  - `aeroTable(design, grid?): { table: AeroTable; csv: string; cpFromNoseM: number }` — `AeroTable` is the `@fds/rocket-sim` type; `csv` is the 11-column text.

- [ ] **Step 1: Write the failing test** — `tests/unit/rocket-design/aeroTable.test.ts` (round-trips through the sim's own loader/interpolator):

```ts
import { describe, expect, it } from 'vitest';
import { loadAeroTable, interpAero } from '@fds/rocket-sim';
import { ALPHA_III, aeroTable, DEFAULT_GRID } from '@fds/rocket-design';

describe('aeroTable — Alpha III', () => {
  const { csv, table, cpFromNoseM } = aeroTable(ALPHA_III);

  it('re-parses through the sim loader on a complete grid', () => {
    const reloaded = loadAeroTable(csv);
    expect(reloaded.machGrid).toEqual(DEFAULT_GRID.machGrid);
    expect(reloaded.aoaGrid).toEqual(DEFAULT_GRID.aoaDegGrid);
  });

  it('has CN that grows with AoA and drag on the CA column', () => {
    const at0 = interpAero(table, 0.2, 0);
    const at10 = interpAero(table, 0.2, 10);
    expect(at0.CN).toBeCloseTo(0, 6);
    expect(at10.CN).toBeGreaterThan(0);
    expect(at10.CA).toBeGreaterThan(0.2); // = cd0
    expect(cpFromNoseM).toBeGreaterThan(0.15);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test -- tests/unit/rocket-design/aeroTable.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/rocket-design/src/aeroTable.ts`:**

```ts
import { loadAeroTable } from '@fds/rocket-sim';
import type { AeroTable } from '@fds/rocket-sim';
import type { RocketDesign } from './components.js';
import { barrowman } from './barrowman.js';
import { cd0 } from './drag.js';

export interface AeroTableSpec {
  machGrid: number[];
  aoaDegGrid: number[];
}

export const DEFAULT_GRID: AeroTableSpec = {
  machGrid: [0, 0.1, 0.3, 0.5, 0.7, 0.9],
  aoaDegGrid: [0, 2, 5, 10, 15],
};

const CMQ = -8;
const CNR = -8;
const CLP = -0.01;

export const aeroTable = (
  design: RocketDesign,
  grid: AeroTableSpec = DEFAULT_GRID,
): { table: AeroTable; csv: string; cpFromNoseM: number } => {
  const b = barrowman(design);
  const lines: string[] = ['Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr'];
  for (const mach of grid.machGrid) {
    const CA = cd0(design, Math.max(mach, 0.05));
    for (const aoaDeg of grid.aoaDegGrid) {
      const CN = b.CNalpha * (aoaDeg * Math.PI) / 180;
      lines.push([mach, aoaDeg, CA, CN, 0, 0, 0, 0, CLP, CMQ, CNR].join(','));
    }
  }
  const csv = lines.join('\n');
  return { table: loadAeroTable(csv), csv, cpFromNoseM: b.cpFromNoseM };
};
```

- [ ] **Step 4: Export** — add `export * from './aeroTable.js';` to the barrel.

- [ ] **Step 5: Run** — `npm run test -- tests/unit/rocket-design/aeroTable.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src/aeroTable.ts packages/rocket-design/src/index.ts tests/unit/rocket-design/aeroTable.test.ts
git commit -m "feat(rocket-design): assemble the 11-column aero table (round-trips the sim loader)"
```

---

## Task 8: `buildRocketConfig` — the generate→consume bridge

**Files:**
- Create: `packages/rocket-design/src/buildConfig.ts`
- Modify: `packages/rocket-design/src/index.ts`
- Test: `tests/unit/rocket-design/buildConfig.test.ts`

**Background — mapping the studio to `RocketConfig` (`packages/rocket-sim/src/types.ts`):** the solid motor maps to the sim's draining-cylinder tank fields; `propellantCgFromNoseM`/`tankBottomFromNoseM` sit at the motor-mount station (the aft body end); `tankRadiusM` = motor radius. Set `ispSeaLevel = ispVacuum = totalImpulse/(g0·propellantMass)` so the sim's `mdot = T/(g0·Isp)` consumes ≈ the motor's propellant over the burn. `gimbal` deflection 0 (no TVC), throttle `{min:1,max:1}`, `guidance.kickDeflectionRad = 0` (vertical ascent), `control` omitted (passive rocket).

**Interfaces:**
- Consumes: `dryMassProps`, `partStations`, `barrowman`, `aeroTable`, `Motor`, `RocketDesign`, `G0` from `@fds/physics-core`.
- Produces: `buildRocketConfig(design: RocketDesign, motor: Motor): RocketConfig`

- [ ] **Step 1: Write the failing test** — `tests/unit/rocket-design/buildConfig.test.ts` (the built config flies in the *unmodified* sim to a finite, positive apogee, without NaN):

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import { ALPHA_III, buildRocketConfig, parseEng } from '@fds/rocket-design';

const c6 = parseEng('Estes_C6', readFileSync(fileURLToPath(new URL('../../../data/motors/Estes_C6.eng', import.meta.url)), 'utf8'));

describe('buildRocketConfig → runRocketSim', () => {
  const cfg = buildRocketConfig(ALPHA_III, c6);

  it('produces a sim-valid config (mass + propellant + complete aero table)', () => {
    expect(cfg.mass.dryKg).toBeGreaterThan(0);
    expect(cfg.mass.propellantKg).toBeCloseTo(c6.propellantKg, 6);
    expect(cfg.aero.cpFromNoseM).toBeGreaterThan(cfg.mass.dryCgFromNoseM); // stable: CP aft of CG
  });

  it('flies to a finite, positive apogee with no NaN', () => {
    const res = runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 60 });
    expect(Number.isFinite(res.summary.apogeeAltitude)).toBe(true);
    expect(res.summary.apogeeAltitude).toBeGreaterThan(10);
    expect(res.summary.apogeeAltitude).toBeLessThan(2000);
    expect(res.telemetry.every((f) => Number.isFinite(f.altitude))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test -- tests/unit/rocket-design/buildConfig.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/rocket-design/src/buildConfig.ts`:**

```ts
import { G0 } from '@fds/physics-core';
import type { RocketConfig } from '@fds/rocket-sim';
import type { RocketDesign } from './components.js';
import type { Motor } from './motors.js';
import { dryMassProps, partStations } from './massModel.js';
import { barrowman } from './barrowman.js';
import { aeroTable } from './aeroTable.js';

const overallLengthM = (design: RocketDesign): number => {
  const stations = partStations(design);
  return design.parts.reduce((max, p, i) => {
    const len = p.kind === 'fins' ? p.rootChordM : p.kind === 'mass' ? 0 : p.lengthM;
    return Math.max(max, stations[i] + len);
  }, 0);
};

export const buildRocketConfig = (design: RocketDesign, motor: Motor): RocketConfig => {
  const dry = dryMassProps(design);
  const b = barrowman(design);
  const { table, cpFromNoseM } = aeroTable(design);
  const length = overallLengthM(design);
  const diameter = 2 * b.refRadiusM;

  // Motor sits at the aft body end; grain length = motor length, aft face at `length`.
  const motorAft = length;
  const motorFore = length - motor.lengthM;
  const propCgFull = (motorFore + motorAft) / 2;
  const effIsp = motor.propellantKg > 0 ? motor.totalImpulseNs / (G0 * motor.propellantKg) : 1;

  return {
    name: design.name,
    mass: {
      dryKg: dry.massKg,
      propellantKg: motor.propellantKg,
      dryCgFromNoseM: dry.cgFromNoseM,
      propellantCgFromNoseM: propCgFull,
      tankBottomFromNoseM: motorAft,
      tankRadiusM: motor.diameterM / 2,
      dryInertiaKgm2: { Ixx: dry.Ixx, Iyy: dry.Iyy, Izz: dry.Izz },
    },
    geometry: { lengthM: length, diameterM: diameter, refAreaM2: b.refAreaM2 },
    propulsion: {
      thrustCurve: motor.thrustCurve,
      ispSeaLevelS: effIsp,
      ispVacuumS: effIsp,
      gimbal: { maxDeflectionRad: 0, maxSlewRateRps: 0, positionFromNoseM: motorAft },
      throttle: { min: 1, max: 1 },
    },
    aero: { table, cpFromNoseM },
    guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
    // control omitted → passive, aerodynamically-stable flight.
  };
};
```

- [ ] **Step 4: Export** — add `export * from './buildConfig.js';` to the barrel.

- [ ] **Step 5: Run** — `npm run test -- tests/unit/rocket-design/buildConfig.test.ts`
Expected: PASS (2 tests). If apogee is absurd (e.g. > 2 km or the vehicle sinks), check: the effective Isp (propellant should deplete near `burnTimeS`), the CP-aft-of-CG stability, and that `refAreaM2` matches the diameter.

- [ ] **Step 6: Commit**

```bash
git add packages/rocket-design/src/buildConfig.ts packages/rocket-design/src/index.ts tests/unit/rocket-design/buildConfig.test.ts
git commit -m "feat(rocket-design): buildRocketConfig bridge (studio → sim); flies in the unmodified core"
```

---

## Task 9: Alpha III cross-check vs OpenRocket + golden-run guard

**Files:**
- Create: `tests/validation/alpha-iii.test.ts`
- Test: (this task *is* the test)

**Background:** the slice's fidelity gate. Model the Alpha III (the Task 2 preset), assert CP, static margin, and C6 apogee match OpenRocket within a stated tolerance. **Obtain the reference numbers from an actual OpenRocket run of its bundled Alpha III example** (File → Open Example → "A simple model rocket") and paste them into `OR` below; the placeholders here are typical published figures to start from — replace with the exact simulated values and set tolerances you can defend.

**Interfaces:** consumes the full `@fds/rocket-design` public API + `@fds/rocket-sim` runner.

- [ ] **Step 1: Write the validation test** — `tests/validation/alpha-iii.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import { ALPHA_III, barrowman, buildRocketConfig, dryMassProps, parseEng, staticMarginCal } from '@fds/rocket-design';

/** Reference values from OpenRocket's bundled Alpha III example (REPLACE with your run). */
const OR = {
  cpFromNoseM: 0.247, // OpenRocket CP station
  cgFromNoseM: 0.187, // loaded CG on a C6
  staticMarginCal: 1.9, // (CP-CG)/diameter
  apogeeC6M: 280, // apogee on an Estes C6, still air
};
const c6 = parseEng('Estes_C6', readFileSync(fileURLToPath(new URL('../../data/motors/Estes_C6.eng', import.meta.url)), 'utf8'));

describe('Alpha III vs OpenRocket', () => {
  it('CP station within ±10%', () => {
    const cp = barrowman(ALPHA_III).cpFromNoseM;
    expect(Math.abs(cp - OR.cpFromNoseM) / OR.cpFromNoseM).toBeLessThan(0.10);
  });

  it('static margin within ±0.6 caliber', () => {
    const cfg = buildRocketConfig(ALPHA_III, c6);
    // Loaded CG at liftoff (dry + propellant) via the sim's own mass model is close to dry here;
    // compare the geometric dry-CG margin to OpenRocket's loaded margin within a generous band.
    const margin = staticMarginCal(ALPHA_III, dryMassProps(ALPHA_III).cgFromNoseM);
    expect(Math.abs(margin - OR.staticMarginCal)).toBeLessThan(0.6);
    expect(cfg.aero.cpFromNoseM).toBeGreaterThan(cfg.mass.dryCgFromNoseM);
  });

  it('C6 apogee within ±15%', () => {
    const cfg = buildRocketConfig(ALPHA_III, c6);
    const res = runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 60 });
    expect(Math.abs(res.summary.apogeeAltitude - OR.apogeeC6M) / OR.apogeeC6M).toBeLessThan(0.15);
  });
});
```

- [ ] **Step 2: Run it** — `npm run test -- tests/validation/alpha-iii.test.ts`
Expected: PASS. If a metric is out of band, tune the **model** (preset dimensions in Task 2, drag `base`/friction in Task 6) — **never** the sim. Record in the test comment which OpenRocket version/example the `OR` numbers came from.

- [ ] **Step 3: Confirm the core is untouched — full suite green** — `npm run test`
Expected: all pass, including `tests/golden-runs/**` and existing `tests/validation/**` (proves `packages/rocket-sim` unchanged).

- [ ] **Step 4: Commit**

```bash
git add tests/validation/alpha-iii.test.ts
git commit -m "test(rocket-design): Alpha III CP/margin/apogee cross-check vs OpenRocket"
```

---

## Task 10: Studio feature scaffold — nav wiring + editable design state

**Files:**
- Modify: `apps/web/src/shell/nav.ts` (enable the `studio` destination)
- Modify: `apps/web/src/App.tsx` (mount `DesignStudioView` for `studio`)
- Create: `apps/web/src/features/design-studio/designModel.ts`
- Create: `apps/web/src/features/design-studio/DesignStudioView.tsx` (placeholder body)
- Test: `apps/web/tests/design-studio.test.tsx`

**Background:** read `apps/web/src/shell/nav.ts` and `App.tsx` first — Phase 8 left a disabled "Studio" nav placeholder and a `ViewId`-keyed router that mounts one view. Enable the entry and route it. `designModel.ts` owns the editable design + reducer.

**Interfaces:**
- Produces:
  - `type DesignAction = { type: 'addPart'; part: Part } | { type: 'removePart'; index: number } | { type: 'movePart'; index: number; dir: -1 | 1 } | { type: 'updatePart'; index: number; part: Part } | { type: 'setMotor'; motorId: string } | { type: 'reset' }`
  - `designReducer(state: RocketDesign, action: DesignAction): RocketDesign`
  - `loadDesign(): RocketDesign` / `saveDesign(d: RocketDesign): void` (localStorage key `fds-rocket-design`)

- [ ] **Step 1: Read the nav + router** — `apps/web/src/shell/nav.ts` and `apps/web/src/App.tsx`. Identify the `studio` `ViewId` and how disabled placeholders are marked. (Do not guess — match the existing shape.)

- [ ] **Step 2: Write `apps/web/src/features/design-studio/designModel.ts`:**

```ts
import type { Part, RocketDesign } from '@fds/rocket-design';
import { ALPHA_III } from '@fds/rocket-design';

const KEY = 'fds-rocket-design';

export type DesignAction =
  | { type: 'addPart'; part: Part }
  | { type: 'removePart'; index: number }
  | { type: 'movePart'; index: number; dir: -1 | 1 }
  | { type: 'updatePart'; index: number; part: Part }
  | { type: 'setMotor'; motorId: string }
  | { type: 'reset' };

export const designReducer = (state: RocketDesign, action: DesignAction): RocketDesign => {
  switch (action.type) {
    case 'addPart':
      return { ...state, parts: [...state.parts, action.part] };
    case 'removePart':
      return { ...state, parts: state.parts.filter((_, i) => i !== action.index) };
    case 'movePart': {
      const j = action.index + action.dir;
      if (j < 0 || j >= state.parts.length) return state;
      const parts = state.parts.slice();
      [parts[action.index], parts[j]] = [parts[j], parts[action.index]];
      return { ...state, parts };
    }
    case 'updatePart':
      return { ...state, parts: state.parts.map((p, i) => (i === action.index ? action.part : p)) };
    case 'setMotor':
      return { ...state, motorId: action.motorId };
    case 'reset':
      return structuredClone(ALPHA_III);
  }
};

export const loadDesign = (): RocketDesign => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RocketDesign;
  } catch {
    /* ignore corrupt/absent storage */
  }
  return structuredClone(ALPHA_III);
};

export const saveDesign = (d: RocketDesign): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage disabled — non-fatal */
  }
};
```

- [ ] **Step 3: Write a placeholder view** — `apps/web/src/features/design-studio/DesignStudioView.tsx`:

```tsx
import type { JSX } from 'react';

export function DesignStudioView(): JSX.Element {
  return (
    <section className="design-studio">
      <h1>Design Studio</h1>
      <p>Rocket design studio — walking skeleton.</p>
    </section>
  );
}
```

- [ ] **Step 4: Enable the nav entry** in `apps/web/src/shell/nav.ts` — flip the `studio` destination from disabled/placeholder to enabled (remove the `disabled`/`soon` flag the Phase 8 code used, matching the shape you found in Step 1).

- [ ] **Step 5: Route it** in `apps/web/src/App.tsx` — in the view switch, render `<DesignStudioView />` for the `studio` view id (import it).

- [ ] **Step 6: Write the failing test** — `apps/web/tests/design-studio.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { ALPHA_III } from '@fds/rocket-design';
import { designReducer } from '../src/features/design-studio/designModel';

describe('designReducer', () => {
  it('reorders parts', () => {
    const moved = designReducer(ALPHA_III, { type: 'movePart', index: 0, dir: 1 });
    expect(moved.parts[0].kind).toBe('tube');
    expect(moved.parts[1].kind).toBe('nose');
  });
  it('sets the motor', () => {
    const d = designReducer(ALPHA_III, { type: 'setMotor', motorId: 'Estes_B6' });
    expect(d.motorId).toBe('Estes_B6');
  });
  it('removes a part', () => {
    const d = designReducer(ALPHA_III, { type: 'removePart', index: 2 });
    expect(d.parts).toHaveLength(2);
  });
});
```

- [ ] **Step 7: Run web tests** — `npm run test:web -- design-studio`
Expected: PASS (3 tests).

- [ ] **Step 8: Verify the route renders** — `npm run build:web`
Expected: tsc + vite succeed (the `@fds/rocket-design` path in `apps/web/tsconfig.json` from Task 1 makes the import resolve).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/src/shell/nav.ts apps/web/src/App.tsx apps/web/tests/design-studio.test.tsx
git commit -m "feat(design-studio): enable Studio nav + editable design state"
```

---

## Task 11: Component tree editor

**Files:**
- Create: `apps/web/src/features/design-studio/ComponentTree.tsx`
- Create: `apps/web/src/features/design-studio/design-studio.css`
- Modify: `apps/web/src/features/design-studio/DesignStudioView.tsx`
- Test: `apps/web/tests/design-studio-tree.test.tsx`

**Interfaces:**
- Consumes: the Phase 8 `Tree`, `Toolbar`, `Button` from `../../ui`; `designReducer` (Task 10).
- Produces: `<ComponentTree design selectedIndex onSelect dispatch />` where `dispatch: (a: DesignAction) => void`.

- [ ] **Step 1: Read the `Tree` primitive API** — `apps/web/src/ui/Tree.tsx` (props: node list, selection, `onSelect`). Match its exact prop names in the component below.

- [ ] **Step 2: Implement `ComponentTree.tsx`** (map the ordered parts to tree nodes; a toolbar adds/removes/reorders):

```tsx
import type { JSX } from 'react';
import type { Part, RocketDesign } from '@fds/rocket-design';
import { Tree, Toolbar, Button } from '../../ui';
import type { DesignAction } from './designModel';

const label = (p: Part): string =>
  p.kind === 'nose' ? `Nose cone (${p.shape})`
  : p.kind === 'tube' ? 'Body tube'
  : p.kind === 'fins' ? `Fin set (${p.count})`
  : `Mass · ${p.label}`;

const NEW_TUBE: Part = { kind: 'tube', lengthM: 0.1, outerRadiusM: 0.0123, wallThicknessM: 0.0003, material: 'kraft-tube' };

export function ComponentTree({
  design, selectedIndex, onSelect, dispatch,
}: {
  design: RocketDesign;
  selectedIndex: number;
  onSelect: (i: number) => void;
  dispatch: (a: DesignAction) => void;
}): JSX.Element {
  const nodes = design.parts.map((p, i) => ({ id: String(i), label: label(p) }));
  return (
    <div className="ds-tree">
      <Toolbar>
        <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'addPart', part: NEW_TUBE })}>+ Tube</Button>
        <Button size="sm" variant="secondary" disabled={selectedIndex < 0} onClick={() => dispatch({ type: 'movePart', index: selectedIndex, dir: -1 })}>↑</Button>
        <Button size="sm" variant="secondary" disabled={selectedIndex < 0} onClick={() => dispatch({ type: 'movePart', index: selectedIndex, dir: 1 })}>↓</Button>
        <Button size="sm" variant="danger" disabled={selectedIndex < 0} onClick={() => dispatch({ type: 'removePart', index: selectedIndex })}>Remove</Button>
      </Toolbar>
      <Tree
        nodes={nodes}
        selectedId={selectedIndex >= 0 ? String(selectedIndex) : undefined}
        onSelect={(id: string) => onSelect(Number(id))}
      />
    </div>
  );
}
```

(Adjust `Tree`/`Toolbar`/`Button` prop names to the exact signatures found in Step 1.)

- [ ] **Step 3: Add minimal layout CSS** — `apps/web/src/features/design-studio/design-studio.css`:

```css
.design-studio { display: grid; grid-template-columns: 260px 1fr 320px; gap: var(--fd-space-4); align-items: start; }
.ds-tree { display: flex; flex-direction: column; gap: var(--fd-space-2); }
@media (max-width: 900px) { .design-studio { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Wire it into the view** — update `DesignStudioView.tsx` to hold state via `useReducer(designReducer, undefined, loadDesign)`, a `selectedIndex` `useState`, import the CSS, and render `<ComponentTree …/>` in the left column. Persist with `useEffect(() => saveDesign(design), [design])`.

- [ ] **Step 5: Write the test** — `apps/web/tests/design-studio-tree.test.tsx` (render the view, click "+ Tube", assert a node appears):

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

describe('ComponentTree', () => {
  it('adds a part via the toolbar', () => {
    render(<DesignStudioView />);
    const before = screen.getAllByText(/Body tube/).length;
    fireEvent.click(screen.getByText('+ Tube'));
    expect(screen.getAllByText(/Body tube/).length).toBe(before + 1);
  });
});
```

- [ ] **Step 6: Run** — `npm run test:web -- design-studio-tree`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/tests/design-studio-tree.test.tsx
git commit -m "feat(design-studio): component tree editor (add/remove/reorder)"
```

---

## Task 12: Part inspector (per-part form)

**Files:**
- Create: `apps/web/src/features/design-studio/PartInspector.tsx`
- Modify: `apps/web/src/features/design-studio/DesignStudioView.tsx`
- Test: `apps/web/tests/design-studio-inspector.test.tsx`

**Interfaces:**
- Consumes: `NumberField`, `Select`, `Panel` from `../../ui`; `MATERIALS` from `@fds/rocket-design`.
- Produces: `<PartInspector part index dispatch />`.

- [ ] **Step 1: Read `NumberField`/`Select` APIs** — `apps/web/src/ui/NumberField.tsx`, `Select.tsx` (label/value/onChange/unit/min/max/step props). Match them below.

- [ ] **Step 2: Implement `PartInspector.tsx`** (render the fields for the selected part's `kind`; every change dispatches an `updatePart`):

```tsx
import type { JSX } from 'react';
import type { Part } from '@fds/rocket-design';
import { MATERIALS } from '@fds/rocket-design';
import { NumberField, Select, Panel } from '../../ui';
import type { DesignAction } from './designModel';

export function PartInspector({
  part, index, dispatch,
}: {
  part: Part | null;
  index: number;
  dispatch: (a: DesignAction) => void;
}): JSX.Element {
  if (!part) return <Panel title="Part"><p>Select a component.</p></Panel>;
  const set = (patch: Partial<Part>) =>
    dispatch({ type: 'updatePart', index, part: { ...part, ...patch } as Part });

  return (
    <Panel title={part.kind}>
      {part.kind === 'nose' && (
        <>
          <Select label="Shape" value={part.shape} onChange={(v) => set({ shape: v as 'ogive' | 'cone' })} options={[{ value: 'ogive', label: 'Ogive' }, { value: 'cone', label: 'Cone' }]} />
          <NumberField label="Length" unit="m" value={part.lengthM} step={0.001} min={0.001} onChange={(v) => set({ lengthM: v })} />
          <NumberField label="Base radius" unit="m" value={part.baseRadiusM} step={0.001} min={0.001} onChange={(v) => set({ baseRadiusM: v })} />
        </>
      )}
      {part.kind === 'tube' && (
        <>
          <NumberField label="Length" unit="m" value={part.lengthM} step={0.001} min={0.001} onChange={(v) => set({ lengthM: v })} />
          <NumberField label="Outer radius" unit="m" value={part.outerRadiusM} step={0.001} min={0.001} onChange={(v) => set({ outerRadiusM: v })} />
        </>
      )}
      {part.kind === 'fins' && (
        <>
          <NumberField label="Count" value={part.count} step={1} min={1} onChange={(v) => set({ count: Math.round(v) })} />
          <NumberField label="Root chord" unit="m" value={part.rootChordM} step={0.001} min={0.001} onChange={(v) => set({ rootChordM: v })} />
          <NumberField label="Tip chord" unit="m" value={part.tipChordM} step={0.001} min={0} onChange={(v) => set({ tipChordM: v })} />
          <NumberField label="Semi-span" unit="m" value={part.semiSpanM} step={0.001} min={0.001} onChange={(v) => set({ semiSpanM: v })} />
          <NumberField label="Sweep" unit="m" value={part.sweepM} step={0.001} onChange={(v) => set({ sweepM: v })} />
        </>
      )}
      {part.kind !== 'mass' && (
        <Select label="Material" value={part.material} onChange={(v) => set({ material: v as Part extends { material: infer M } ? M : never })} options={MATERIALS.map((m) => ({ value: m, label: m }))} />
      )}
    </Panel>
  );
}
```

(Match the exact `NumberField`/`Select` prop names + `options` shape from Step 1; the `material` cast just needs `MaterialId`.)

- [ ] **Step 3: Wire into the view** — render `<PartInspector part={design.parts[selectedIndex] ?? null} index={selectedIndex} dispatch={dispatch} />` in the right column of `DesignStudioView`.

- [ ] **Step 4: Write the test** — `apps/web/tests/design-studio-inspector.test.tsx` (select the fin set, change count, assert the tree label updates):

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

describe('PartInspector', () => {
  it('edits the selected part', () => {
    render(<DesignStudioView />);
    fireEvent.click(screen.getByText(/Fin set/));
    const count = screen.getByLabelText('Count') as HTMLInputElement;
    fireEvent.change(count, { target: { value: '4' } });
    fireEvent.blur(count);
    expect(screen.getByText(/Fin set \(4\)/)).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run** — `npm run test:web -- design-studio-inspector`
Expected: PASS. (If `NumberField` commits on Enter not blur, fire `keyDown` Enter instead — match its API.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/tests/design-studio-inspector.test.tsx
git commit -m "feat(design-studio): per-part inspector form"
```

---

## Task 13: Live schematic (side view + CP/CG markers + margin)

**Files:**
- Create: `apps/web/src/features/design-studio/Schematic.tsx`
- Modify: `apps/web/src/features/design-studio/DesignStudioView.tsx`
- Test: `apps/web/tests/design-studio-schematic.test.tsx`

**Interfaces:**
- Consumes: `dryMassProps`, `barrowman`, `staticMarginCal`, `partStations` from `@fds/rocket-design`; `chartTheme`/tokens for colors.
- Produces: `<Schematic design />`.

- [ ] **Step 1: Implement `Schematic.tsx`** (a side-view SVG scaled to the overall length; draw each part, then a blue CG tick and an accent CP tick, and a margin caption):

```tsx
import type { JSX } from 'react';
import type { RocketDesign } from '@fds/rocket-design';
import { barrowman, dryMassProps, partStations, staticMarginCal } from '@fds/rocket-design';

const VW = 720, VH = 160, PAD = 24;

export function Schematic({ design }: { design: RocketDesign }): JSX.Element {
  const stations = partStations(design);
  const b = barrowman(design);
  const dm = dryMassProps(design);
  const margin = staticMarginCal(design, dm.cgFromNoseM);
  const length = Math.max(
    ...design.parts.map((p, i) => stations[i] + (p.kind === 'fins' ? p.rootChordM : p.kind === 'mass' ? 0 : p.lengthM)),
    1e-3,
  );
  const sx = (x: number) => PAD + (x / length) * (VW - 2 * PAD);
  const midY = VH / 2;
  const R = b.refRadiusM;
  const ry = (r: number) => (r / (2 * R || 1)) * 30;

  const stable = margin >= 1;
  return (
    <div className="ds-schematic">
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Side view; static margin ${margin.toFixed(2)} calibers`}>
        <rect x={0} y={0} width={VW} height={VH} fill="var(--fd-surface-2)" rx={8} />
        {design.parts.map((p, i) => {
          const x0 = sx(stations[i]);
          if (p.kind === 'tube') return <rect key={i} x={x0} y={midY - ry(p.outerRadiusM)} width={sx(stations[i] + p.lengthM) - x0} height={2 * ry(p.outerRadiusM)} fill="var(--fd-elevated)" stroke="var(--fd-border)" />;
          if (p.kind === 'nose') return <polygon key={i} points={`${x0},${midY} ${sx(stations[i] + p.lengthM)},${midY - ry(p.baseRadiusM)} ${sx(stations[i] + p.lengthM)},${midY + ry(p.baseRadiusM)}`} fill="var(--fd-elevated)" stroke="var(--fd-border)" />;
          if (p.kind === 'fins') return <polygon key={i} points={`${x0},${midY - ry(R)} ${x0 + (sx(stations[i] + p.sweepM) - x0)},${midY - ry(R) - ry(p.semiSpanM)} ${x0 + (sx(stations[i] + p.sweepM) - x0) + (sx(p.tipChordM) - PAD)},${midY - ry(R) - ry(p.semiSpanM)} ${sx(stations[i] + p.rootChordM)},${midY - ry(R)}`} fill="var(--fd-elevated)" stroke="var(--fd-border)" />;
          return null;
        })}
        <line x1={sx(dm.cgFromNoseM)} y1={midY - 40} x2={sx(dm.cgFromNoseM)} y2={midY + 40} stroke="var(--fd-series-1)" strokeWidth={2} />
        <text x={sx(dm.cgFromNoseM)} y={midY + 54} fill="var(--fd-series-1)" fontSize={11} textAnchor="middle">CG</text>
        <line x1={sx(b.cpFromNoseM)} y1={midY - 40} x2={sx(b.cpFromNoseM)} y2={midY + 40} stroke="var(--fd-accent)" strokeWidth={2} />
        <text x={sx(b.cpFromNoseM)} y={midY - 46} fill="var(--fd-accent)" fontSize={11} textAnchor="middle">CP</text>
      </svg>
      <p className="ds-margin" style={{ color: stable ? 'var(--fd-good)' : 'var(--fd-warning)' }}>
        Static margin: {margin.toFixed(2)} cal {stable ? '· stable' : '· marginal'}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the view** — render `<Schematic design={design} />` in the centre column.

- [ ] **Step 3: Write the test** — `apps/web/tests/design-studio-schematic.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

describe('Schematic', () => {
  it('renders CP/CG and a numeric static margin', () => {
    render(<DesignStudioView />);
    expect(screen.getByText('CP')).toBeTruthy();
    expect(screen.getByText('CG')).toBeTruthy();
    expect(screen.getByText(/Static margin: .* cal/)).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run** — `npm run test:web -- design-studio-schematic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/tests/design-studio-schematic.test.tsx
git commit -m "feat(design-studio): live side-view schematic with CP/CG + static margin"
```

---

## Task 14: Motor picker + design summary

**Files:**
- Create: `apps/web/src/features/design-studio/motorCatalog.ts`
- Create: `apps/web/src/features/design-studio/MotorPicker.tsx`
- Modify: `apps/web/src/features/design-studio/DesignStudioView.tsx`
- Test: `apps/web/tests/design-studio-motor.test.tsx`

**Background:** the web app can't read `data/motors` at runtime, so bundle the `.eng` text via Vite's `?raw` import into a catalog the studio can parse with `parseEng`.

**Interfaces:**
- Produces:
  - `MOTORS: Record<string, Motor>` (parsed at module load)
  - `MOTOR_IDS: string[]`
  - `<MotorPicker design dispatch />`

- [ ] **Step 1: Implement `motorCatalog.ts`** (bundle the three `.eng` files):

```ts
import { parseEng } from '@fds/rocket-design';
import type { Motor } from '@fds/rocket-design';
import a8 from '../../../../../data/motors/Estes_A8.eng?raw';
import b6 from '../../../../../data/motors/Estes_B6.eng?raw';
import c6 from '../../../../../data/motors/Estes_C6.eng?raw';

export const MOTORS: Record<string, Motor> = {
  Estes_A8: parseEng('Estes_A8', a8),
  Estes_B6: parseEng('Estes_B6', b6),
  Estes_C6: parseEng('Estes_C6', c6),
};
export const MOTOR_IDS = Object.keys(MOTORS);
```

(Verify the relative depth of the `?raw` path from `apps/web/src/features/design-studio/`; adjust the `../` count so it points at repo-root `data/motors`. If Vite disallows importing outside the app root, copy the three `.eng` files into `apps/web/src/features/design-studio/motors/` and import from there instead — note this in the commit.)

- [ ] **Step 2: Implement `MotorPicker.tsx`:**

```tsx
import type { JSX } from 'react';
import type { RocketDesign } from '@fds/rocket-design';
import { Select, Stat } from '../../ui';
import type { DesignAction } from './designModel';
import { MOTORS, MOTOR_IDS } from './motorCatalog';

export function MotorPicker({ design, dispatch }: { design: RocketDesign; dispatch: (a: DesignAction) => void }): JSX.Element {
  const motor = MOTORS[design.motorId] ?? MOTORS[MOTOR_IDS[0]];
  return (
    <div className="ds-motor">
      <Select
        label="Motor"
        value={design.motorId}
        onChange={(v) => dispatch({ type: 'setMotor', motorId: v })}
        options={MOTOR_IDS.map((id) => ({ value: id, label: `${MOTORS[id].designation} (${MOTORS[id].impulseClass})` }))}
      />
      <Stat label="Total impulse" value={motor.totalImpulseNs.toFixed(1)} unit="N·s" />
      <Stat label="Avg thrust" value={motor.avgThrustN.toFixed(1)} unit="N" />
      <Stat label="Burn time" value={motor.burnTimeS.toFixed(2)} unit="s" />
    </div>
  );
}
```

- [ ] **Step 3: Add a summary strip** in `DesignStudioView` using `Stat` — length, dry mass, CG, CP, margin (compute via `dryMassProps`/`barrowman`/`staticMarginCal`). Render `<MotorPicker/>` in the right column under the inspector.

- [ ] **Step 4: Write the test** — `apps/web/tests/design-studio-motor.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

describe('MotorPicker', () => {
  it('shows motor stats and switches motor', () => {
    render(<DesignStudioView />);
    expect(screen.getByText('Total impulse')).toBeTruthy();
    const select = screen.getByLabelText('Motor') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Estes_B6' } });
    expect((screen.getByLabelText('Motor') as HTMLSelectElement).value).toBe('Estes_B6');
  });
});
```

- [ ] **Step 5: Run** — `npm run test:web -- design-studio-motor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/tests/design-studio-motor.test.tsx
git commit -m "feat(design-studio): motor picker + design summary"
```

---

## Task 15: Fly it — run the sim and plot the ascent

**Files:**
- Create: `apps/web/src/features/design-studio/flyIt.ts`
- Modify: `apps/web/src/features/design-studio/DesignStudioView.tsx`
- Test: `apps/web/tests/design-studio-flyit.test.tsx`

**Interfaces:**
- Consumes: `buildRocketConfig` (`@fds/rocket-design`), `openLoopAscent`, `runRocketSim` (`@fds/rocket-sim`), `MOTORS` (Task 14), `TimeChart` (`lib/charts`).
- Produces:
  - `interface FlightResult { apogeeM: number; apogeeTimeS: number; maxMach: number; maxAxialG: number; series: { t: number; altitudeM: number; speedMps: number }[] }`
  - `fly(design: RocketDesign): FlightResult` (truncates telemetry at apogee)

- [ ] **Step 1: Implement `flyIt.ts`:**

```ts
import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import type { RocketDesign } from '@fds/rocket-design';
import { buildRocketConfig } from '@fds/rocket-design';
import { MOTORS, MOTOR_IDS } from './motorCatalog';

export interface FlightResult {
  apogeeM: number;
  apogeeTimeS: number;
  maxMach: number;
  maxAxialG: number;
  series: { t: number; altitudeM: number; speedMps: number }[];
}

export const fly = (design: RocketDesign): FlightResult => {
  const motor = MOTORS[design.motorId] ?? MOTORS[MOTOR_IDS[0]];
  const cfg = buildRocketConfig(design, motor);
  const res = runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 60, sampleEvery: 5 });
  const upTo = res.telemetry.filter((f) => f.t <= res.summary.apogeeTime);
  return {
    apogeeM: res.summary.apogeeAltitude,
    apogeeTimeS: res.summary.apogeeTime,
    maxMach: res.summary.maxMach,
    maxAxialG: res.summary.maxAxialG,
    series: upTo.map((f) => ({ t: f.t, altitudeM: f.altitude, speedMps: f.speed })),
  };
};
```

- [ ] **Step 2: Wire the "Fly it" button + results** into `DesignStudioView`: a `Button variant="primary"` that sets `const [flight, setFlight] = useState<FlightResult | null>(null)` via `setFlight(fly(design))`; when present, render apogee/maxMach/maxG `Stat`s and a `TimeChart` of altitude (and speed) vs `t` (see `apps/web/src/lib/charts.tsx` for the `TimeChart` props — `data`, `series`, `xKey`).

- [ ] **Step 3: Write the test** — `apps/web/tests/design-studio-flyit.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { ALPHA_III } from '@fds/rocket-design';
import { fly } from '../src/features/design-studio/flyIt';

describe('fly', () => {
  it('returns a positive apogee and a rising altitude series', () => {
    const r = fly(ALPHA_III);
    expect(r.apogeeM).toBeGreaterThan(10);
    expect(r.series.length).toBeGreaterThan(2);
    expect(r.series[r.series.length - 1].altitudeM).toBeGreaterThan(r.series[0].altitudeM);
  });
});
```

- [ ] **Step 4: Run** — `npm run test:web -- design-studio-flyit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design-studio apps/web/tests/design-studio-flyit.test.tsx
git commit -m "feat(design-studio): Fly it — run the sim and plot the ascent"
```

---

## Task 16: Full verification + roadmap note

**Files:**
- Modify: `finalproductroadmap.md` (progress-log entry)

- [ ] **Step 1: Full package suite (core untouched)** — `npm run test`
Expected: all green, including golden runs. If red, a `packages/rocket-sim` file was touched — revert it.

- [ ] **Step 2: Web suite** — `npm run test:web`
Expected: all green (existing 58 + the new design-studio tests).

- [ ] **Step 3: Build** — `npm run build:web`
Expected: tsc `--noEmit` + vite succeed.

- [ ] **Step 4: Typecheck the packages** — `npm run typecheck`
Expected: no errors (the `@fds/rocket-design` path is registered).

- [ ] **Step 5: Manual walkthrough** — `npm run dev:web` → open **Studio**: build/edit Alpha III in the tree, watch CP/CG + margin update live, switch motor to C6, click **Fly it**, confirm a sane apogee (~200–300 m) and a non-tumbling boost trace.

- [ ] **Step 6: Add a roadmap progress-log entry** to `finalproductroadmap.md` (newest first) noting Phase 9 slice 1 landed: `packages/rocket-design` (mass/Barrowman/drag/motors/buildConfig) + the `design-studio` feature, Alpha III cross-checked vs OpenRocket, core untouched.

- [ ] **Step 7: Commit**

```bash
git add finalproductroadmap.md
git commit -m "docs: record Phase 9 slice 1 (design studio walking skeleton)"
```

---

## Self-Review

- **Spec coverage:** component model (T2–T3) ✓, subsonic Barrowman + CP/margin (T5) ✓, drag buildup (T6) ✓, aero table in the sim's format (T7) ✓, `.eng` motor parse + curated motors (T4) ✓, buildConfig bridge (T8) ✓, tree editor (T11) ✓, inspector (T12) ✓, schematic with CP/CG (T13) ✓, motor picker + summary (T14) ✓, Fly it via the untouched sim (T15) ✓, OpenRocket Alpha III cross-check (T9) ✓, core-untouched guard (T9, T16) ✓. Deferred items (recovery, transonic, worker offload, YAML I/O, full nose/fin families) are out of this slice by design.
- **Type consistency:** `RocketDesign`/`Part`/`Motor` names are stable across tasks; `buildRocketConfig(design, motor)` signature matches T15's call; `DesignAction` variants match the reducer and the UI dispatch sites; `aeroTable` returns `{ table, csv, cpFromNoseM }` used consistently in T8/T9.
- **Placeholder scan:** the only intentional "fill in" is the `OR` reference numbers in T9, which the implementer must replace with values from an actual OpenRocket Alpha III run (called out explicitly). UI prop names for Phase-8 primitives (`Tree`/`NumberField`/`Select`/`Toolbar`/`Stat`) are to be matched against their source in the read-first steps (T10.1, T11.1, T12.1) rather than guessed.

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.
