# CLAUDE.md

Orientation for AI coding agents working in this repo. Keep it short; update it when the shape of the project changes.

## What this is

**Flight Dynamics & Controls Simulation Suite** — a physics-accurate TypeScript monorepo covering four modules:

- **A — Rocket** (6-DOF ascent/descent + TVC), **B — Reentry** (3-DOF corridor/heating), **C — Aircraft** (linearized state-space), **D — Landing sim** (interactive suicide-burn powered descent).

`README.md` is the authoritative spec (physics, equations, schemas, build order). Read the relevant section before changing a module. Modules A–C map to Sections 4–6; Module D to Section 7.

## Layout

```
packages/          # pure TS, no DOM — same code runs in browser and Node tests
  physics-core/    # vectors, quaternions, RK4/RK45 integrators
  atmosphere-models/
  rocket-sim/      # Module A EOM + guidance (poweredDescentGuidance in src/guidance/landing.ts)
  reentry-sim/     # Module B
  aircraft-sim/    # Module C state-space + modal analysis
apps/web/          # React 19 + Vite front-end (all modules); Module D lives in src/features/landing-sim/
data/              # *.yaml vehicle configs, aero/thrust tables
tests/             # Node validation/unit suite for the packages
```

## Conventions

- **Package manager: npm (workspaces), NOT pnpm.** Run everything from the repo root — see README "Getting Started". `npm run dev:web`, `npm run build:web`, `npm run test` (packages), `npm run test:web` (front-end).
- **SI units internally**, convert only at the UI boundary. Physics must stay deterministic/bit-reproducible (fixed timestep, no `Math.random()`/wall-clock in the loop).
- **Don't modify the shared physics** in `packages/*` when adding front-end features — add guidance/render layers on top (see README §7 / §11 constraints).
- Front-end shared chrome (`.panel/.stat/.chip/.btn` in `apps/web/src/styles.css`, `palette.ts` tokens) is used by Modules A/B/C. Module D is scoped to `.landing-*` / `.lc-*` and `--l-*` / `LANDING` tokens so it can look distinct without touching the shared classes.

## Git

- Remote: `github.com/roasteduck04/rocket-sim`, default branch `main`.
- Commits are authored as **roasteduck04** with **no Claude / co-author trailers**.
