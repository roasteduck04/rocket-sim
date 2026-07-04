# Implementation Plan — Flight Dynamics & Controls Simulation Suite

## Context

The repo (`C:\1NGWZ\1NGWZ\1-NTU\Projects\rocket-sim`) contains a single file: `README.md`, a detailed product spec + implementation guide for a three-module flight-dynamics suite (6-DOF rocket with TVC landing, 3-DOF reentry corridor tool, linearized aircraft trainer) over a shared TypeScript math/atmosphere core. Nothing is implemented yet. This plan turns the README's Build Roadmap (Section 11, Phases 0–7) into concrete file-level tasks, flags spec ambiguities with resolving assumptions, identifies the highest-risk silent-bug traps, and maps every Section 10 validation case to the phase that must satisfy it.

## Tooling decisions (unspecified by README — chosen defaults)

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces, TS project references | README structure implies packages/apps split; pnpm is the low-friction default |
| Language/config | TypeScript strict, ESM throughout | README mandates TS end-to-end |
| Tests | Vitest, run from root `tests/` tree as README specifies (`tests/unit`, `tests/validation`, `tests/golden-runs`) | Runs same code in Node as browser |
| Web app | Vite + React + @react-three/fiber + Recharts (strip charts) + custom SVG/D3 for corridor chart | README names React/Three/Recharts-or-D3 |
| YAML configs | `js-yaml` + hand-rolled validators (no zod) | Keep dependency surface minimal per README philosophy |
| Numerics | All hand-rolled (Vec3/Quat/Mat3, RK4, RK45, 4×4 eigensolver) | Explicit README requirement |

Directory skeleton follows README Section 2 exactly (built at repo root; the README's `flight-dynamics-suite/` name is just illustrative).

---

## Phase 0 — Foundations (`physics-core`, `atmosphere-models`)

**Scaffolding:** root `package.json` (workspaces), `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, per-package `package.json`/`tsconfig.json`. Create `docs/equations.md` stub (grows each phase).

### packages/physics-core/src/

| File | Exports | Depends on |
|---|---|---|
| `vec3.ts` | `Vec3` (`{x,y,z}`), `vadd, vsub, vscale, vdot, vcross, vnorm, vnormalize, vzero, vneg` | — |
| `quat.ts` | `Quat` (scalar-first `[q0,q1,q2,q3]`), `qmul, qnormalize, qconj, qderiv` (q̇ = ½Ω(ω)q per §3.1), `qfromEuler321, qtoEuler321, qtoDCM` (NED→body), `rotateNEDtoBody, rotateBodyToNED` | vec3 |
| `mat3.ts` | `Mat3`, `m3vec, m3mul, m3transpose, m3inv, m3diag` (inertia tensor ops) | vec3 |
| `complex.ts` | `Complex`, arithmetic ops (needed by eigensolver) | — |
| `eig.ts` | `eig4x4(A): Complex[]` — Faddeev–LeVerrier char-poly + Durand–Kerner root finder (small, deterministic, unit-testable) | complex |
| `integrators.ts` | `Deriv = (t, x: Float64Array, u) => Float64Array`; `rk4Step`, `rk45Step` (Dormand–Prince w/ error estimate), `integrateFixed(deriv, t0, x0, u, dt, opts)`, `integrateAdaptive(..., {tol, dtMin: 1e-3, dtMax})`; both accept `terminate(t,x)` event callback with bisection-refined event time | — |
| `gravity.ts` | `gravityAtAltitude(h)` = g0·(Re/(Re+h))² (§3.3); `j2Acceleration` stub (Phase 7 toggle) | constants |
| `constants.ts` | `G0=9.80665, RE=6371000, R_AIR=287.05, GAMMA_AIR=1.4, K_SUTTON_GRAVES=1.7415e-4, OMEGA_EARTH=7.2921159e-5, T0_SL=288.15, P0_SL=101325, RHO0_SL=1.225` | — |
| `units.ts` | `ftToM, mToFt, lbfToN, degToRad, radToDeg, ktsToMps, ...` | — |
| `index.ts` | re-exports | all above |

### packages/atmosphere-models/src/

| File | Exports | Depends on |
|---|---|---|
| `us76.ts` | `atmosphere(hGeometric): {T, p, rho, a, inVacuum}` — 7-layer US76 piecewise 0–86 km, geometric→geopotential conversion internally | physics-core (constants) |
| `exponential.ts` | `exponentialExtension(h)` — above 86 km, ρ = ρ₈₆·exp(−(h−h₈₆)/H), continuity-matched at 86 km; `inVacuum` true below configurable ρ threshold (default 1e-9 kg/m³) | us76 |
| `wind.ts` | `WindProfile` (constant \| linear-shear \| table), `windAtAltitude(profile, h): Vec3` (NED) | physics-core (vec3) |
| `index.ts` | unified `atmosphere(h)` dispatching us76/exponential; re-exports | all above |

### Phase 0 tests (Section 10.1 — all satisfied here)

- `tests/unit/vec3.test.ts`, `tests/unit/mat3.test.ts` — algebra identities.
- `tests/unit/quat.test.ts` — **norm drift over long integration** (constant-rate spin, 10⁵ RK4 steps + renormalization; drift bounded).
- `tests/unit/integrators.test.ts` — **RK4 vs RK45 agreement on SHO**; RK4 4th-order convergence check.
- `tests/unit/eig.test.ts` — known 4×4 matrices with analytic eigenvalues (real, complex-pair, repeated).
- `tests/unit/atmosphere.test.ts` — **spot-checks vs published US76 tables** (0, 5, 11, 20, 47, 80 km) for T/p/ρ/a; continuity at layer boundaries and at 86 km handoff.

---

## Phase 1 — Aircraft module (`aircraft-sim`)

### packages/aircraft-sim/src/

| File | Exports | Depends on |
|---|---|---|
| `types.ts` | `AircraftConfig` (schema §8.3 + extensions, see Ambiguity A2), `TrimCondition`, `LonState [û,α,q,θ]`, `LatState [β,p,r,φ]`, `ControlsLon [δe,δt]`, `ControlsLat [δa,δr]`, `ModeReport {name, wn, zeta, tHalfOrDouble, period}` | — |
| `loader.ts` | `loadAircraftYaml(text): AircraftConfig` with validation + defaults | types, js-yaml |
| `dimensionalize.ts` | `dimensionalizeLon(cfg): {Xu, Xα, Zu, Zα, Zq, Mu, Mα, Mαdot, Mq, Xδe, Zδe, Mδe, Xδt}`, `dimensionalizeLat(cfg): {Yβ, Yp, Yr, Lβ, Lp, Lr, Nβ, Np, Nr, ...control derivs}` — nondim→dimensional using trim q̄₀, S, c̄, b, m, Iyy/Ixx/Izz. Formulas mirrored in `docs/equations.md`. Name roll/yaw derivs `L_beta_deriv` etc. to avoid the Lift collision (§6.3 note) | types, physics-core, atmosphere-models (ρ₀ at h₀) |
| `stateSpace.ts` | `buildLonStateSpace(cfg): {A: number[][], B}` per §6.2 **including M_α̇ coupling in row 3 of both A and B**; `buildLatStateSpace(cfg)` per §6.3 | dimensionalize |
| `modal.ts` | `modalAnalysis(A): ModeReport[]` (eig4x4 → pair conjugates → ωn, ζ, t½/t₂ₓ, classify short-period/phugoid/roll/spiral/dutch-roll); `approxShortPeriod, approxPhugoid, approxDutchRoll, approxRollTau, approxSpiralTau` (closed forms §6.2/6.3 for UI readout + sanity cross-check) | physics-core (eig) |
| `simulate.ts` | `AircraftSim` — packs x_lon/x_lat into Float64Arrays, steps both independently with RK4 dt=1/60; `doubletInput(t0, width, amplitude)` generator | stateSpace, physics-core (integrators) |
| `index.ts` | re-exports incl. illustrative signatures from §7 | all above |

### Data

- `data/aircraft-derivatives/generic-light-single.aircraft.yaml` — §8.3 values + extended fields.
- `data/aircraft-derivatives/navion.aircraft.yaml` — Navion from Nelson's *Flight Stability and Automatic Control* (published eigenvalues/mode characteristics exist → validation target).

### Phase 1 tests (Section 10.4 — all satisfied here)

- `tests/unit/dimensionalize.test.ts` — hand-checked conversion formulas.
- `tests/validation/aircraft-modes.test.ts` — **eigenvalues reproduce published Navion short-period/phugoid/dutch-roll/spiral within tolerance**; closed-form approximations agree with eigenvalues to ~10–20%.
- `tests/validation/aircraft-doublet.test.ts` — **elevator doublet: fast damped short-period + slow lightly-damped phugoid, distinct timescales**.
- `tests/unit/aircraft-symmetry.test.ts` — **±aileron doublets → mirror-image roll response** (catches B_lat sign bugs).
- `docs/equations.md`: add dimensionalization formulas + sign conventions chapter.

---

## Phase 2 — Rocket ascent, open-loop (`rocket-sim`)

### packages/rocket-sim/src/

| File | Exports | Depends on |
|---|---|---|
| `types.ts` | `RocketState {r: Vec3, v: Vec3, q: Quat, omega: Vec3, mass}`, `RocketConfig` (schema §8.1 + extensions A5/A7), `GimbalCommand {deltaP, deltaY, throttle}`, `TelemetryFrame` (§4.7 fields), `RunSummary` | physics-core |
| `state.ts` | `packState/unpackState` (14-element Float64Array: r 3, v_body 3, q 4, ω 3, m 1); `renormalizeQuat(x)` called after each step in sim loop | types |
| `massProperties.ts` | `massProps(cfg, mProp): {m, cgFromNose, I: Mat3(diag)}` — dry inertia (about dry CG) + propellant cylinder draining top-down (CG interpolates full-load position → tank bottom; cylinder inertia ½mr², m(3r²+h²)/12) with **parallel-axis transfer of both to the instantaneous combined CG** | types, physics-core (mat3) |
| `aero.ts` | `loadAeroTable(csv): AeroTable` (`[Mach, AoA_deg, CA, CN, Cm, CY, Cl, Cn, Clp, Cmq, Cnr]`, bilinear interp); `aeroForcesMoments(x, cfg, atmo, wind): {F_body, M_body, alpha, beta, mach, qbar, staticMargin}` per §4.3 incl. p̂,q̂,r̂ damping; moments taken about **instantaneous CG** using CP–CG arm | types, massProperties, physics-core, atmosphere-models |
| `propulsion.ts` | `loadThrustCurve(csvOrEng): ThrustCurve` (linear interp); `thrustAt(t, h, cfg): {T, mdot}` with Isp(h) pressure blend (§4.4), ṁ = T/(g0·Isp(h)), thrust → 0 when propellant exhausted | types, atmosphere-models |
| `tvc.ts` | `GimbalActuator` — clamp ±δ_max + slew-rate limit (stateful, dt-aware); `thrustForceMoment(T, δp, δy, cgFromNose, cfg): {F_body, M_body}` — **moment arm r_gimbal_to_cg recomputed from instantaneous CG every call** | types, massProperties, physics-core |
| `deriv.ts` | `derivRocket(t, x, cfg, controls, env): Float64Array` — §4.2 EOM: m(v̇+ω×v) = F_aero+F_thrust+R(q)·g_NED (R(q): NED→body); Iω̇+ω×(Iω) = M (İω neglected, documented — A10); ṙ_NED = R(q)ᵀ·v_body; q̇ = ½Ω(ω)q; ṁ = −mdot | state, massProperties, aero, propulsion, tvc, physics-core, atmosphere-models |
| `guidance.ts` | `GuidanceMode` interface; `openLoopAscent(cfg)` — vertical rise → pitch-over kick at configured t/h → zero-commanded-gimbal gravity turn | types |
| `sim.ts` | `runRocketSim(cfg, guidance, opts): {telemetry, summary}` — fixed RK4 dt=0.01, quaternion renorm per step, events (burnout, apogee, ground impact), summary metrics (apogee, max Mach, max-Q, max axial/lateral g) | deriv, guidance, state, physics-core |
| `loader.ts` | `loadRocketYaml(text): RocketConfig` | types, js-yaml |
| `index.ts` | re-exports | all |

### Data

- `data/thrust-curves/booster_main.csv` (time,thrust pairs for the §8.1 reference booster).
- `data/aero-tables/booster_aero.csv` — Barrowman-estimate table; optional `scripts/generate-aero-table.py` to produce it (README endorses Python for offline table generation).
- `data/reference-tvc-booster.rocket.yaml` — §8.1 values + tank/throttle extensions.

### Phase 2 tests

- `tests/validation/rocket-ballistic.test.ts` — **zero-thrust/zero-drag point mass matches closed-form parabola** (§10.2.1).
- `tests/validation/rocket-neutral-stability.test.ts` — **zero static margin (CP=CG) → no restoring pitch moment** (§10.2.2); plus positive-margin restoring / negative-margin diverging direction checks.
- `tests/unit/mass-properties.test.ts` — analytic CG/I at full, half, empty propellant; **assert CG crosses CP mid-burn for the reference config** (dry CG 6.1 m is aft of CP 5.4 m — margin goes negative near burnout; deliberate stress case).
- `tests/unit/aero-table.test.ts` — bilinear interp exact on grid nodes; α/β sign checks (`α = atan2(w,u)`).
- `tests/unit/propulsion.test.ts` — Isp(h) blend endpoints; propellant-exhaustion cutoff; ∫ṁ dt consistency.
- `tests/golden-runs/ascent-reference.json` + regression test (tolerance-compared telemetry snapshot).

---

## Phase 3 — Rocket TVC control loop

| File | Exports | Depends on |
|---|---|---|
| `control/pid.ts` | `Pid` — Kp/Ki/Kd with integral anti-windup (clamped), derivative term fed by measured rate (−q, −r per §4.6), reset() | — |
| `control/attitudeControl.ts` | `AttitudeController` — cascaded θ/ψ error → PID → δp_cmd/δy_cmd → GimbalActuator (clamp+slew); roll channel stub/config-toggle (§4.6). All gains/limits from config, nothing hardcoded | pid, tvc, types |
| `guidance.ts` (extend) | `attitudeHold(profile)` guidance mode — commanded attitude vs time | attitudeControl |

### Phase 3 tests

- `tests/unit/pid.test.ts` — anti-windup, slew limiting, derivative-on-measurement.
- `tests/validation/rocket-pid-step.test.ts` — **step attitude-error → damped 2nd-order response matching linearized closed-loop prediction** (§10.2.3). Linearized model: θ̈ = (T·l_arm/Iyy)·δp with instantaneous Iyy and l_arm. **Run at both full and near-empty propellant loads** — this is what catches stale moment-arm/inertia caching (see Traps).

---

## Phase 4 — Rocket powered descent (hero feature)

| File | Exports | Depends on |
|---|---|---|
| `guidance/landing.ts` | `poweredDescentGuidance(cfg)` — suicide-burn ignition trigger h ≈ v²/(2·a_max)·(1+margin); vertical-velocity-profile tracking PID → throttle; horizontal-position PID → small attitude commands → attitude controller → gimbal (cascade per §4.6.3); touchdown detection (h≤0 event) | attitudeControl, pid, types |
| `sim.ts` (extend) | descent scenario runner (initial condition = descending from a few km); landing metrics in `RunSummary`: miss distance, touchdown v_z, touchdown lateral v, touchdown g | guidance/landing |

MVP scenario is the landing burn from a descent initial condition; full boostback arc is optional/stretch (Ambiguity A8).

### Phase 4 tests

- `tests/validation/rocket-landing.test.ts` — **sweep grid of initial altitude/velocity within the guidance capture region → all touchdowns with v_z < `touchdown_vz_max_mps` (2 m/s)** and bounded miss distance (§10.2.4).
- `tests/golden-runs/landing-reference.json` regression.

---

## Phase 5 — Reentry module (`reentry-sim`)

### packages/reentry-sim/src/

| File | Exports | Depends on |
|---|---|---|
| `types.ts` | `ReentryState {V, gamma, psi, h, lat, lon}` (6-element Float64Array), `ReentryConfig` (§8.2), `ReentryRun {history, peaks}`, `CorridorCurve {vEntry[], gammaOvershoot[], gammaUndershoot[]}` | — |
| `loader.ts` | `loadReentryYaml(text)` | types, js-yaml |
| `deriv.ts` | `derivReentry(t, x, cfg, bank)` — full 3-DOF rotating-spherical-Earth EOM (§5.1) with **complete Coriolis/centrifugal terms from Vinh/Vallado** (README leaves a literal `[cross terms]` placeholder — A3); D, L from ballistic coefficient / constant hypersonic Cd, L/D (fixed-trim capsule); ψ measured from North toward East (A4) | types, physics-core, atmosphere-models |
| `heating.ts` | `suttonGraves(rho, V, Rn)` = k_Q·√(ρ/R_n)·V³; heat-load accumulator | physics-core (constants) |
| `outputs.ts` | `auxOutputs(t, x, cfg): {qdotS, nLoad, qbar, mach, downrange}` — n = √(D²+L²)/(m·g0); downrange via great-circle from entry point | heating, deriv helpers |
| `sim.ts` | `runReentry(cfg, gammaEntry, vEntry, bankProfile): ReentryRun` — RK45 adaptive (dt_min 1e-3 near peak heating), termination events: h≤0, skip-out, limit-exceeded; records histories + peaks (q̇ₛmax, Q_total, n_max, t-to-peaks, downrange) | deriv, outputs, physics-core |
| `corridor.ts` | `classifyTrajectory(run): 'landed' \| 'skipped' \| 'limits-exceeded'` (skip = post-perigee h climbs back above entry interface altitude — A4); `findOvershootBoundary(cfg, vEntry, bracket)`, `findUndershootBoundary(...)` — bisection to γ tolerance 1e-4 rad with max-iteration guard and bracket-validity precheck; `findEntryCorridor(cfg, vEntryRange, nPoints): CorridorCurve` sweep | sim, types |
| `index.ts` | re-exports (§7 signatures) | all |

### Data

- `data/reentry-vehicles/generic-capsule.reentry.yaml` (§8.2 values).

### Phase 5 tests (Section 10.3 — all satisfied here)

- `tests/unit/sutton-graves.test.ts` — **hand-calc: ρ=1e-4, V=7000, Rn=1 → q̇ₛ ≈ 5.97×10⁵ W/m²** (§10.3.3).
- `tests/validation/ballistic-entry.test.ts` — **L=0 steep entry: peak g and peak q̇ₛ near-simultaneous** per Allen–Eggers theory (§10.3.1).
- `tests/validation/corridor-bisection.test.ts` — **identical boundary from ≥3 different starting brackets** (§10.3.2); plus classifier-monotonicity sweep across the bracket.
- `tests/golden-runs/reentry-reference.json` regression.
- `docs/equations.md`: full rotating-Earth EOM derivation + skip-out classifier definition.

---

## Phase 6 — UI integration (`apps/web`)

Vite + React + TS app; physics packages imported as workspace deps (no DOM in them).

| File | Purpose |
|---|---|
| `src/main.tsx`, `src/App.tsx` | shell, module tab router |
| `src/lib/useFixedTimestepLoop.ts` | rAF accumulator hook — fixed physics tick decoupled from render (§7) |
| `src/lib/simWorker.ts` + `src/workers/{ascent,corridor}.worker.ts` | Web Worker batch runs (full ascent, corridor sweep) streaming results to charts |
| `src/lib/unitsDisplay.ts` | SI→display conversions at UI boundary only |
| `src/modules/rocket/RocketView.tsx`, `TrajectoryScene.tsx` (r3f 3D path), `TelemetryCharts.tsx` (alt/vel/Mach/q̄/static-margin + max-Q/max-g markers), `LandingView.tsx` (velocity vector, lateral offset, touchdown g), `ConfigPanel.tsx` | Module A view (§9) |
| `src/modules/reentry/ReentryView.tsx`, `CorridorChart.tsx` (signature chart: shaded valid band, **draggable entry-point marker** with live inside/outside feedback), `HeatGLoadCharts.tsx` (limit lines), `GroundTrackMap.tsx`, `AltVelChart.tsx` | Module B view (§9) |
| `src/modules/aircraft/AircraftView.tsx`, `AttitudeIndicator.tsx` (SVG artificial horizon from θ, φ), `StickWidget.tsx` (virtual stick + keyboard/gamepad bindings), `StripCharts.tsx` (α,β,p,q,r,φ,θ scrolling), `ModalReadout.tsx` (live ωn/ζ/t½ table), `DoubletButtons.tsx` (**first-class mode-excitation buttons**, §6.4) | Module C view (§9) |

Standard aerospace sign/color conventions throughout (§9). No new physics tests; add a smoke test that the app builds and each module mounts.

---

## Phase 7 — Stretch (outline-level only)

- `physics-core/gravity.ts`: implement the J2 toggle.
- `rocket-sim/guidance/pdg.ts`: convex-optimization powered-descent guidance; boostback scenario.
- `reentry-sim/radiative.ts`: radiative heating term for super-orbital entries.
- `aircraft-sim/nonlinear6dof.ts`: nonlinear 6-DOF upgrade path (reuses rocket-sim EOM structure).

---

## Spec ambiguities & resolving assumptions

| # | Ambiguity | Assumption |
|---|---|---|
| A1 | Monorepo/test/build tooling never specified | pnpm workspaces, Vitest, Vite (table at top) |
| A2 | §8.3 aircraft schema is missing derivatives the §6.2/6.3 A-matrices require: `C_Xu/C_Zu` (or `CD0`+`CL0`), `Y_p, Y_r, Cl_r, Cn_p, Cn_p`, `CZ_δe`, throttle derivative `X_δt`, `Cm_u` | Extend the YAML schema with optional fields defaulting to 0; compute trim `CL0 = mg/(q̄S)` from level-flight trim; simple direct-thrust model for `X_δt`. B-matrices (never written out in the spec) derived per Etkin incl. `M_α̇·Z_δe/U0` coupling; documented in `docs/equations.md` |
| A3 | §5.1 γ̇ equation literally contains the placeholder "[Coriolis/centrifugal cross terms]" | Use the complete Vinh/Vallado rotating-spherical-Earth formulation; full derivation in `docs/equations.md` |
| A4 | "Skipped out … while V is still super-orbital" is imprecise; ψ heading datum unstated | Skip-out = post-perigee h climbs back above entry-interface altitude (velocity check secondary/logged); ψ = 0 due North, positive toward East (consistent with the φ̇/λ̇ equations as written) |
| A5 | §8.1 gives propellant CG at full load "interpolated toward tank-bottom" but no tank geometry | Add `tank_bottom_from_nose_m` + tank diameter (= vehicle diameter default) to schema; propellant = cylinder draining top-down, height from mass fraction |
| A6 | Reference point for `dry_inertia_kgm2` unstated | About the dry CG; parallel-axis to combined CG each step |
| A7 | Throttle appears in telemetry (§4.7) and is required by suicide-burn guidance, but absent from §8.1 schema and §4.4 | Add `propulsion.throttle: {min, max}` (e.g. 0.4–1.0); descent thrust = rated thrust × throttle |
| A8 | Module A descent: "optionally through boostback" | MVP = landing burn from a descending initial condition; boostback = Phase 7 stretch |
| A9 | `.eng`/CSV thrust curves give T(t) but no ṁ schedule | ṁ = T/(g0·Isp(h)); thrust cut when propellant exhausted; log discrepancy between ∫ṁ dt and `propellant_kg` |
| A10 | §4.2 Euler equation omits the İω term (mass varying) | Quasi-static neglect (standard practice); documented explicitly in `docs/equations.md` |
| A11 | Aero table has no CP column, but config says CP "may itself be Mach-dependent in the table" | Optional `Xcp` CSV column; fall back to config scalar `cp_from_nose_m` |
| A12 | CY/Cl/Cn are functions of β but the table axis is AoA | Axisymmetric vehicle assumption: evaluate side-plane coefficients at (Mach, |β|) with sign restored — same table serves both planes |
| A13 | Exponential-atmosphere scale height above 86 km unspecified | H = R·T₈₆/g ≈ 5.6 km, chosen for density continuity at 86 km |
| A14 | §3.1 lists ECI/ECEF but Module A's state is NED-only | MVP: flat-Earth local NED with g(h) inverse-square; ECI/ECEF deferred (downrange straight from NED). Reentry module handles Earth rotation in its own flight-path frame |
| A15 | Wind sign convention ("added to freestream") | Wind vector defined in NED; `v_rel_body = v_body − R(q)·wind_NED` |
| A16 | Which "textbook reference aircraft" for §10.4 validation | Navion (Nelson, *Flight Stability and Automatic Control*) — published derivative set **and** published mode eigenvalues |
| A17 | λ̇ singularity at poles (cos φ → 0) | Guard + warn; out of scope for realistic entries |
| A18 | Charting library "Recharts or D3" | Recharts for strip charts; custom SVG/D3 for the interactive corridor chart (drag marker) |

---

## Correctness traps → which tests catch them

**T1. Inertia/CG bookkeeping as propellant depletes.**
Traps: holding I constant across a burn; forgetting parallel-axis transfer of dry + propellant inertias to the *moving combined* CG; static-margin sign errors. The §8.1 reference config makes CG cross CP mid-burn (full: CG 5.06 m fwd of CP 5.4 m → stable; dry: CG 6.1 m aft of CP → unstable) — a sim that silently freezes CG never shows this.
Caught by: **Phase 2** `mass-properties.test.ts` (analytic full/half/empty checks + margin-crossing assertion) and `rocket-neutral-stability.test.ts` (§10.2.2); golden-run drift catches regressions.

**T2. Gimbal moment arm recomputation.**
Trap: caching `r_gimbal_to_cg` at t=0 — control effectiveness then wrong for the whole burn, and a PID validated only at full load looks fine.
Caught by: **Phase 3** `rocket-pid-step.test.ts` run **at both full and near-empty propellant** against linearized predictions built from *instantaneous* Iyy and arm (§10.2.3); **Phase 4** landing sweep (arm changes fastest during the landing burn — touchdown v_z bound fails if arm is stale).

**T3. Entry-corridor bisection convergence.**
Traps: skip classifier firing on any transient h increase instead of post-perigee climb above interface; brackets that don't straddle the boundary; integrator tolerance looser than bisection tolerance (boundary "converges" to noise); grazing trajectories exactly at the q̇/n limit.
Caught by: **Phase 5** `corridor-bisection.test.ts` — same boundary from multiple brackets (§10.3.2) plus classifier-monotonicity sweep; RK45 tolerance pinned at least 10× tighter than the γ bisection tolerance in `corridor.ts`.

**T4. Longitudinal/lateral-directional sign conventions.**
Traps: Z-down body axis (normal force enters as −C_N), `α = atan2(w,u)` sign, elevator/aileron/rudder deflection signs in B matrices, `(Y_r/U0 − 1)` term, `g·cosθ0` placement, NED→body vs body→NED quaternion transpose mix-ups, gimbal deflection sign (§4.4: +δp gives −Z thrust component → nose-up moment for aft engine).
Caught by: **Phase 1** `aircraft-symmetry.test.ts` (§10.4.3 — mirror aileron responses), `aircraft-modes.test.ts` (wrong signs shift eigenvalues far outside tolerance), doublet direction assertions; **Phase 2** parabola test (gravity sign) and neutral-stability test; add a Phase 2 unit check that +δp produces a nose-up moment for the aft-mounted engine.

---

## Section 10 validation cases → phase mapping

| § | Test case | Phase |
|---|---|---|
| 10.1 | Quaternion normalization drift | 0 |
| 10.1 | RK4 vs RK45 on simple harmonic oscillator | 0 |
| 10.1 | US76 atmosphere spot-checks vs published tables | 0 |
| 10.2 | Zero-thrust/zero-drag parabola vs closed form | 2 |
| 10.2 | Zero static margin → neutral pitch stability | 2 |
| 10.2 | PID step response vs linearized closed-loop prediction | 3 |
| 10.2 | Landing-burn touchdown v_z < limit across capture region | 4 |
| 10.3 | Ballistic drop: peak g ≈ peak heat flux timing | 5 |
| 10.3 | Corridor bisection bracket-independence | 5 |
| 10.3 | Sutton-Graves hand-calc spot check (≈5.97e5 W/m²) | 5 |
| 10.4 | Eigenvalues reproduce published reference-aircraft modes | 1 |
| 10.4 | Elevator doublet: short-period/phugoid timescale separation | 1 |
| 10.4 | Aileron symmetry (mirror roll responses) | 1 |

---

## Verification

Per phase, before moving on (README's own gate: build strictly in Section 11 order):

1. `pnpm vitest run tests/unit tests/validation` — all tests for that phase green.
2. Golden runs: generate reference trajectory once physics is validated, commit JSON, regression-compare thereafter (`tests/golden-runs`).
3. Determinism check: run the same sim twice, assert bit-identical telemetry (README §1 requirement) — one shared test utility, applied to each module's runner.
4. Phase 6: `pnpm --filter web build` + module mount smoke tests; manual check of doublet buttons exciting the right modes and corridor-marker drag feedback.
