# Flight Dynamics & Controls Simulation Suite

A unified, physics-accurate simulation suite covering three regimes of the flight envelope — **powered ascent/descent**, **atmospheric reentry**, and **cruise flight dynamics** — built around a shared math and physics core. Think of it as three connected mini-labs: a SpaceX-style landing-leg simulator, a reentry-corridor tool, and an interactive stick-and-rudder trainer.

This document is both a product spec and an implementation guide. It defines the physics, the math, the module boundaries, the data schemas, the architecture, and the build order in enough detail that an engineer (human or AI) can implement it without needing to make significant unstated assumptions.

---

## Table of Contents

- [Getting Started](#getting-started)
1. [Project Philosophy](#1-project-philosophy)
2. [Repository Structure](#2-repository-structure)
3. [Shared Foundations](#3-shared-foundations)
4. [Module A — 6-DOF Rocket Flight Simulator](#4-module-a--6-dof-rocket-flight-simulator)
5. [Module B — Reentry Vehicle Simulator](#5-module-b--reentry-vehicle-simulator)
6. [Module C — Linearized Aircraft Flight Dynamics Model](#6-module-c--linearized-aircraft-flight-dynamics-model)
7. [Module D — Landing Simulator](#7-module-d--landing-simulator)
8. [Tech Stack & Architecture](#8-tech-stack--architecture)
9. [Data Schemas](#9-data-schemas)
10. [UI / Visualization Spec](#10-ui--visualization-spec)
11. [Validation & Test Suite](#11-validation--test-suite)
12. [Build Roadmap](#12-build-roadmap)
13. [Symbol Glossary](#13-symbol-glossary)
14. [References](#14-references)

---

## Getting Started

The suite is a TypeScript monorepo using **npm workspaces** (`packages/*` for the physics/sim libraries, `apps/web` for the interactive front-end). Node 20+ is recommended.

**Install** (once, from the repo root — installs every workspace):

```bash
npm install
```

**Run the web app locally:**

```bash
npm run dev:web
```

This starts the Vite dev server; open the printed URL (default <http://localhost:5173>). The app opens on the **Overview** — a flight-envelope map of the whole suite; click a regime (or a module card) to enter it. A tab bar switches between the Overview and Modules A/B/C and **D · Landing**. Hot-module reload is on, so edits under `apps/web/src` refresh live.

**Build the web app** (type-checks with `tsc` first, then bundles to `apps/web/dist`):

```bash
npm run build:web
```

**Run the tests:**

```bash
npm run test        # physics/sim suite (Node, packages/* + tests/)
npm run test:web    # front-end component/smoke tests (Vitest + Testing Library)
```

Other root scripts: `npm run typecheck` (packages) and `npm run typecheck:web` (front-end). All scripts run from the repo root — the `*:web` variants forward to the `web` workspace, so you don't need to `cd apps/web`.

---

## 1. Project Philosophy

- **Physics first, graphics second.** Every module must be correct against known analytical or textbook limiting cases before any visual polish happens.
- **Shared core, independent modules.** All three simulators consume the same math/atmosphere/integrator primitives so behavior is consistent and code isn't duplicated three times.
- **SI units internally, always.** Convert at the UI boundary only. No mixed-unit bugs.
- **Deterministic, testable physics.** Given the same initial state, config, and inputs, a run must be bit-reproducible (fixed timestep, no wall-clock-dependent randomness in the physics loop).
- **Real numbers, not toy numbers.** Aerodynamic coefficients, thrust curves, and stability derivatives should be loaded from data tables/config files representing real or realistic vehicles, not hardcoded magic constants.

---

## 2. Repository Structure

```
flight-dynamics-suite/
├── packages/
│   ├── physics-core/          # vectors, quaternions, rotation matrices, integrators
│   ├── atmosphere-models/     # US Standard Atmosphere 1976, exponential model, wind
│   ├── rocket-sim/            # Module A: 6-DOF ascent/descent + TVC control
│   ├── reentry-sim/           # Module B: 3-DOF reentry, heating, corridor
│   └── aircraft-sim/          # Module C: linearized state-space aircraft model
├── apps/
│   └── web/                   # interactive front-end (all 3 modules)
├── data/
│   ├── thrust-curves/         # *.csv or *.eng motor files
│   ├── aero-tables/           # Cd/Cl/Cm vs Mach & AoA lookup tables
│   ├── reentry-vehicles/      # ballistic coefficient, nose radius, L/D configs
│   └── aircraft-derivatives/  # stability & control derivative sets per aircraft
├── tests/
│   ├── unit/
│   ├── validation/            # analytic-solution regression tests
│   └── golden-runs/           # recorded reference trajectories
└── docs/
    └── equations.md           # derivations, assumptions, sign conventions
```

---

## 3. Shared Foundations

All three modules depend on this layer. Build it first.

### 3.1 Reference Frames

| Frame | Symbol | Definition |
|---|---|---|
| Earth-Centered Inertial | ECI | Non-rotating, origin at Earth center. Used for orbital-adjacent rocket ascent and reentry. |
| Earth-Centered Earth-Fixed | ECEF | Rotates with Earth. Used to derive ground track, downrange distance. |
| North-East-Down local | NED | Local tangent plane at a reference lat/lon. Primary frame for guidance and display. |
| Body frame | B | Origin at vehicle CG. X-forward (nose), Y-right (starboard), Z-down — standard aerospace body-axis convention. |
| Wind/stability frame | W | X aligned with relative velocity vector; used to define α (angle of attack) and β (sideslip). |

Rotations between NED/ECEF and body are represented with **unit quaternions** (avoids gimbal lock, critical for the rocket module which can pass through large attitude excursions). Euler angles (φ roll, θ pitch, ψ yaw) are derived from the quaternion only for display.

```
q = [q0, q1, q2, q3]   (scalar-first, ||q|| = 1)
q̇ = 0.5 * Ω(ω) * q
Ω(ω) = [[0, -p, -q, -r],
        [p,  0,  r, -q],
        [q, -r,  0,  p],
        [r,  q, -p,  0]]
```

### 3.2 Atmosphere Model

Implement the **US Standard Atmosphere 1976** as a piecewise function of geopotential altitude, valid 0–86 km, returning temperature `T`, pressure `p`, density `ρ`, and speed of sound `a = sqrt(γ·R·T)`. Above 86 km (relevant only for high-apogee rocket trajectories), fall back to an exponential decay model with an explicit "vacuum" flag once density drops below a configurable threshold (e.g. `1e-9 kg/m³`).

For the reentry module specifically, expose density as a function usable inside the integrator at every substep — this is the single most sensitivity-critical input for heating and deceleration.

Wind: support a simple altitude-varying wind profile (constant, linear shear, or a lookup table) added as a vector to freestream velocity before computing α, β, and dynamic pressure.

### 3.3 Gravity Model

Default: inverse-square, `g(h) = g0 · (Re / (Re + h))²`, with `g0 = 9.80665 m/s²`, `Re = 6,371,000 m`. Optional J2 oblateness term for higher-fidelity long-duration or orbital-adjacent cases; make it a toggle, not a requirement for MVP.

### 3.4 Numerical Integration

- Primary integrator: **RK4** fixed-step for real-time/interactive contexts (predictable cost per frame).
- Secondary integrator: **RK45 (Dormand-Prince, adaptive)** for offline high-accuracy validation runs, especially reentry heating integrals where stiffness varies a lot with altitude.
- Default fixed timestep: `dt = 0.01 s` for rocket/aircraft real-time loops; reentry offline runs can use adaptive stepping down to `dt_min = 1e-3 s` near peak heating.
- All modules integrate a single flat `state` vector; each module defines its own `deriv(t, state, controls) -> statedot` function, and the shared integrator package is agnostic to what's inside the vector.

### 3.5 Unit & Constants Module

Single source of truth for: `g0`, `R_earth`, `R_specific_air = 287.05 J/(kg·K)`, `gamma_air = 1.4`, Sutton-Graves constant, standard-day sea-level conditions, and unit conversion helpers (`ftToM`, `lbfToN`, `degToRad`, etc.). Nothing in the physics core should hardcode a conversion factor inline.

---

## 4. Module A — 6-DOF Rocket Flight Simulator

Models a rocket from liftoff through ascent, and optionally through a powered-descent/landing-leg phase (Falcon-9-style boostback and landing burn) under active TVC (thrust-vector-control) stabilization.

### 4.1 State Vector

```
x = [ r_NED (3),           // position in local NED frame, m
      v_body (3),          // velocity in body frame, m/s   (u, v, w)
      q (4),                // attitude quaternion, NED->body
      ω_body (3),          // angular rate, rad/s           (p, q, r)
      m (1) ]               // instantaneous vehicle mass, kg
```

### 4.2 Equations of Motion

**Translational (body-frame Newton's second law with rotating-frame correction):**

```
m (v̇_body + ω_body × v_body) = F_aero + F_thrust + R(q)ᵀ · F_gravity_NED
```

**Rotational (Euler's rigid-body equation):**

```
I · ω̇_body + ω_body × (I · ω_body) = M_aero + M_thrust + M_control
```

`I` is the instantaneous inertia tensor (see 4.5). For a slender, roughly axisymmetric rocket, off-diagonal terms are small and can be neglected in MVP (`I ≈ diag(Ixx, Iyy, Izz)` with `Iyy ≈ Izz`); revisit if the vehicle has large asymmetric appendages (grid fins, landing legs deployed).

**Position propagation:** integrate `v_body` rotated into NED by the current attitude quaternion.

### 4.3 Aerodynamics

```
V_rel = v_body - wind_body          // relative airspeed in body frame
q̄ = 0.5 · ρ(h) · |V_rel|²           // dynamic pressure
Mach = |V_rel| / a(h)
α = atan2(w_rel, u_rel)             // angle of attack
β = asin(v_rel / |V_rel|)           // sideslip

F_aero_body = q̄ · S_ref · [-C_A(Mach, α); C_Y(Mach, β); -C_N(Mach, α)]
M_aero_body = q̄ · S_ref · d_ref · [C_l(Mach, β, p̂); C_m(Mach, α, q̂); C_n(Mach, β, r̂)]
```

- `C_A, C_N, C_Y` — axial/normal/side force coefficients, looked up from a Mach×AoA table (bilinear interpolation).
- `C_m` — pitching moment coefficient; **static margin** = `(X_cp − X_cg) / d_ref` must be tracked every timestep since it shrinks as propellant burns (CG moves aft toward a possibly-fixed CP), directly affecting rotational stability — this is one of the most important dynamics to get right for a landing-leg sim.
- `p̂, q̂, r̂` — non-dimensional rates (`p·d/(2V)`, etc.) used for aerodynamic damping derivatives `C_lp, C_mq, C_nr`.

Aero tables should be loadable from CSV (`data/aero-tables/`) in the shape `[Mach, AoA_deg, CA, CN, Cm, CY, Cl, Cn, Clp, Cmq, Cnr]`. Ship at least one realistic table generated from Barrowman-method estimates or OpenRocket-exported data for the reference vehicle.

### 4.4 Propulsion & Thrust Vector Control

**Thrust curve ingestion:** support standard `.eng` motor-file format (time, thrust pairs) or an analytic model:

```
T(t) = Isp(t) · g0 · ṁ(t)
```

with `ṁ(t)` from a propellant mass-flow schedule. Interpolate linearly between table points. Account for **Isp variation with ambient pressure** if modeling sea-level-to-vacuum ascent: `Isp(h) = Isp_vac − (Isp_vac − Isp_sl) · (p(h)/p0)`.

**Gimbal (TVC):** thrust vector deflects by pitch/yaw gimbal angles `(δp, δy)`, bounded by actuator limits (typically ±5–8° for a landing-leg-style engine) and slew-rate-limited (deg/s):

```
F_thrust_body = T · [ cos(δp)·cos(δy);
                       sin(δy);
                      -sin(δp)·cos(δy) ]

M_thrust_body = r_gimbal_to_cg × F_thrust_body
```

`r_gimbal_to_cg` is the moment arm from the engine gimbal point to the instantaneous CG — this also changes as propellant depletes and must be recomputed each step, not treated as constant.

### 4.5 Mass Properties

```
m(t) = m_dry + m_prop(t)
m_prop(t) = m_prop_0 − ∫ ṁ dt
```

Model the inertia tensor as the sum of a fixed dry-structure inertia (from a simple mass-element breakdown: airframe shell, engine, avionics, landing legs) plus a propellant inertia modeled as a cylinder (or spherical cap, if modeling a tank draining top-down) whose mass and CG location shrink over the burn. Recompute `I(t)` and CG(t) every step; do **not** hold inertia constant across a burn — this is one of the most common correctness bugs in amateur rocket sims and it directly undermines the control-loop validation.

### 4.6 Control Loop (PID Gimbal Stabilization)

Classic cascaded attitude control:

```
θ_err = θ_cmd − θ_actual
δp_cmd = Kp_θ·θ_err + Ki_θ·∫θ_err dt + Kd_θ·(−q)        // rate feedback as derivative term
δp = clamp(δp_cmd, −δ_max, +δ_max)
δp = rateLimit(δp, δ̇_max, dt)
```

Same structure for yaw (`δy`, `ψ_err`, `r`). Roll control (if the vehicle has no roll-control gimbal authority) typically uses small differential aero surfaces or RCS thrusters — treat as a stub/config-toggle for MVP.

**Guidance modes to implement, in order of complexity:**
1. **Open-loop ascent** — pitch-over ("gravity turn") program, no active guidance, just to validate aero + propulsion.
2. **Attitude-hold** — PID holds a commanded attitude profile (validates the control loop in isolation).
3. **Powered-descent / landing-leg mode** — a simple **suicide-burn** guidance law: ignite when `h ≈ v²/(2·a_max)`, then a PID loop tracks a commanded vertical-velocity profile down to a soft touchdown (`v_touchdown < 2 m/s`), with lateral position held near zero by pitch/yaw gimbal commands derived from a horizontal-position PID feeding attitude commands. This is the "SpaceX landing leg" behavior the project is aiming for; a full convex-optimization powered-descent-guidance (PDG) solver is a stretch goal, not MVP.

Expose all PID gains, actuator limits, and guidance-mode parameters in the vehicle config file (Section 8) — nothing should be hardcoded in the control-loop implementation.

### 4.7 Outputs

Per-timestep telemetry: `t, r_NED, v_body, |V|, Mach, α, β, q̄, attitude(Euler), ω, m, static_margin, δp, δy, throttle`. Summary metrics: apogee altitude, max Mach, max q̄ ("max-Q"), max axial/lateral g-load, landing accuracy (miss distance + touchdown velocity, if descent mode is run).

---

## 5. Module B — Reentry Vehicle Simulator

Models a ballistic or lifting reentry vehicle from entry interface (typically 120 km altitude) to landing/splashdown or breakup, tracking heating, deceleration g-loads, and entry-corridor constraints.

### 5.1 Formulation

Use a **3-DOF point-mass model over a rotating spherical Earth**, expressed in flight-path coordinates — this is the standard formulation for corridor/heating analysis and is far more tractable than full 6-DOF for this module's purpose (6-DOF is reserved for Module A where attitude control is the point; here, deceleration/heating/corridor are the point).

**State vector:**

```
x = [ V (1),      // relative velocity magnitude, m/s
      γ (1),      // flight path angle, rad (negative = descending)
      ψ (1),      // heading angle, rad
      h (1),      // altitude, m
      φ_lat (1),  // latitude, rad
      λ_lon (1) ] // longitude, rad
```

**Equations of motion:**

```
V̇     = −D/m − g·sin(γ)  +  Ω_e²·(Re+h)·cos(φ_lat)·[sin(γ)cos(φ_lat) − cos(γ)sin(φ_lat)cos(ψ)]
γ̇·V   = (L·cos(σ))/m − (g − V²/(Re+h))·cos(γ)  +  2Ω_e·V·cos(φ_lat)·sin(ψ)  +  [Coriolis/centrifugal cross terms]
ψ̇·V·cos(γ) = (L·sin(σ))/m  +  (V²/(Re+h))·cos(γ)·sin(ψ)·tan(φ_lat)  −  2Ω_e·V·(sin(φ_lat) − cos(φ_lat)cos(ψ)tan(γ))
ḣ     = V·sin(γ)
φ̇_lat = (V·cos(γ)·cos(ψ)) / (Re+h)
λ̇_lon = (V·cos(γ)·sin(ψ)) / ((Re+h)·cos(φ_lat))
```

`σ` is the **bank angle** — the only real-time control input for a lifting entry vehicle (capsule with offset CG, like Apollo/Dragon/Orion), used to steer lift up/down/sideways without a separate control surface. Ballistic vehicles (near-zero L/D) simply set `L ≈ 0` and the corridor collapses toward a single entry-angle target rather than a range.

**Forces:**

```
D = q̄ · S_ref · Cd(Mach, α)
L = q̄ · S_ref · Cl(Mach, α)
q̄ = 0.5 · ρ(h) · V²
```

For a fixed-trim capsule, `α` is essentially constant (trimmed AoA), so `Cd`, `Cl` reduce to functions of Mach only, or can be treated as constants defined by the vehicle's **ballistic coefficient** `β_bc = m / (Cd·S_ref)` and **hypersonic L/D**.

### 5.2 Heating Model

**Stagnation-point convective heat flux** — Sutton-Graves correlation (standard for entry-corridor analysis, valid hypersonic regime):

```
q̇_s = k_Q · sqrt(ρ / R_n) · V³
```

with `k_Q ≈ 1.7415×10⁻⁴` (SI: ρ in kg/m³, V in m/s, R_n in m, result in W/m²) and `R_n` the effective nose radius (a vehicle config parameter — smaller nose radius = sharper heating spike, which is why blunt bodies are used for high-speed entry).

**Integrated heat load** (drives thermal protection system sizing):

```
Q_total = ∫ q̇_s dt   (J/m²)
```

Track both peak `q̇_s` and `Q_total` as headline outputs. Radiative heating (relevant only for very high entry velocities, e.g. lunar/Mars return) can be added as an optional secondary term but is not required for LEO-return-class MVP.

### 5.3 G-Load

```
n_load = sqrt(D² + L²) / (m · g0)
```

Report both instantaneous and peak g-load across the trajectory; this is one of the two binding constraints (with peak heat flux) on the undershoot boundary below.

### 5.4 Entry Corridor

The entry corridor is the **range of entry flight-path angles `γ_entry`** (measured at the entry interface altitude, typically 120 km) for a given entry velocity that satisfies *both* boundaries simultaneously:

- **Overshoot / skip-out boundary** — the *shallowest* allowable `γ_entry`. If the entry angle is too shallow (too close to 0°), the vehicle doesn't decelerate enough in a single pass through the sensible atmosphere and skips back out to an elliptical trajectory instead of continuing to descend (this can be a mission failure — or a deliberate skip-reentry technique). Determine numerically: for a given `γ_entry`, integrate forward; if `h(t)` reaches a local minimum and then increases back above the entry-interface altitude while `V` is still super-orbital, that trajectory has "skipped out" — it violates the overshoot boundary.
- **Undershoot / burn-up boundary** — the *steepest* allowable `γ_entry`, set by whichever of peak heat flux `q̇_s,max` or peak g-load `n_max` first exceeds the vehicle's structural/thermal limits (both are config parameters, e.g. `q̇_s,limit = 1 MW/m²`, `n_limit = 8g` for a crewed capsule). Steeper entry → higher peak deceleration and heating, reached faster.
- **Corridor width** = `γ_undershoot − γ_overshoot` (both are typically negative numbers; a "wider corridor" means more entry-angle margin for navigation error — this is the actual engineering quantity mission designers care about).

**Implementation approach:** run a bisection/binary search over `γ_entry` at fixed `V_entry` to find each boundary (skip-out: search for the shallowest angle where max altitude in the post-perigee climb stays below entry interface; undershoot: search for the steepest angle where `q̇_s,max` or `n_max` just touches the configured limit), then repeat across a sweep of entry velocities to produce a full corridor plot (`γ_entry` vs `V_entry`, with the valid region shaded between the two boundary curves) — this chart is the signature visualization for this module.

### 5.5 Outputs

Time histories of `V, γ, h, q̇_s, n_load, downrange`; summary metrics `q̇_s,max`, `Q_total`, `n_max`, time-to-peak-heating, time-to-peak-g, landing/splashdown downrange distance; and the corridor boundary curves described above.

---

## 6. Module C — Linearized Aircraft Flight Dynamics Model

Small-perturbation (linearized) longitudinal and lateral-directional equations of motion about a trimmed flight condition, driven by an interactive stick-and-rudder input. This is the classic "Etkin-style" state-space aircraft model used throughout flight-dynamics education and flight-control design.

### 6.1 Trim Condition

Before linearizing, define a trim/reference flight condition: `U0` (trim airspeed), `θ0` (trim pitch attitude, ≈ flight path angle for level flight), altitude `h0` (sets `ρ0`), and trim control positions (`δe0, δt0`). All perturbation variables are deviations from this trim point; the model is only valid for small excursions around it (roughly `α, β, φ, θ < ~15°` and airspeed deviations of a similar percentage — outside that range you're back in nonlinear 6-DOF territory, which this module deliberately does not attempt to cover).

### 6.2 Longitudinal Dynamics

**State vector** `x_lon = [û, α, q, θ]ᵀ` (using `û = Δu/U0`, and treating `α ≈ w/U0` for small angles), **control vector** `u_lon = [δe, δt]ᵀ` (elevator, throttle).

```
ẋ_lon = A_lon · x_lon + B_lon · u_lon
```

with the standard aerospace-derivative form of `A_lon`:

```
A_lon =
[ X_u        X_α          0          −g·cosθ0 ]
[ Z_u/U0     Z_α/U0    1+Z_q/U0      −g·sinθ0/U0 ]
[ M_u+M_α̇Z_u/U0   M_α+M_α̇Z_α/U0   M_q+M_α̇(1+Z_q/U0)      0 ]
[ 0            0             1               0    ]
```

`X_u, Z_α, M_q`, etc. are **dimensional stability derivatives** — force/moment per unit perturbation, per unit mass or inertia, e.g. `X_u = (1/m)·∂X/∂u`. These are computed from the standard non-dimensional stability derivatives (`C_Xu, C_Lα, C_mα, C_mq, C_mα̇`, etc. — sourced from wind-tunnel data, DATCOM-style handbook methods, or vortex-lattice output) combined with the trim dynamic pressure, reference area/chord, mass, and `I_yy`. Ship the conversion formulas in `docs/equations.md` and take the non-dimensional derivatives as the config input (Section 8) so the module is aircraft-agnostic.

**Characteristic modes** (found as eigenvalues of `A_lon`, but with well-known closed-form approximations useful for sanity-checking and for the UI's "mode readout"):

- **Short-period mode** (fast, well-damped, pitch-rate dominated):
  ```
  ω_n,sp ≈ sqrt( (M_q·Z_α/U0) − M_α )
  ζ_sp   ≈ −(M_q + Z_α/U0 + M_α̇) / (2·ω_n,sp)
  ```
- **Phugoid mode** (slow, lightly-damped, exchange of kinetic/potential energy — classic Lanchester approximation):
  ```
  ω_n,ph ≈ (g·√2) / U0
  ζ_ph   ≈ 1 / (√2 · (L/D)_trim)
  ```

### 6.3 Lateral-Directional Dynamics

**State vector** `x_lat = [β, p, r, φ]ᵀ`, **control vector** `u_lat = [δa, δr]ᵀ` (aileron, rudder).

```
ẋ_lat = A_lat · x_lat + B_lat · u_lat

A_lat =
[ Y_β/U0     Y_p/U0      (Y_r/U0 − 1)     g·cosθ0/U0 ]
[ L_β         L_p           L_r               0      ]
[ N_β         N_p           N_r               0      ]
[ 0           1              tanθ0             0      ]
```

(`L_β, L_p, L_r, N_β, N_p, N_r` here are the dimensional roll/yaw derivatives, not to be confused with lift `L` — see glossary for disambiguation, and namespace them distinctly in code, e.g. `L_beta_dot_deriv` vs. `Lift`, to avoid the classic symbol collision.)

**Characteristic modes:**

- **Roll subsidence** — fast, heavily-damped first-order roll response: `τ_roll ≈ −1/L_p`.
- **Dutch roll** — lightly-damped coupled yaw/roll oscillation, generally the mode of most interest for handling-qualities work:
  ```
  ω_n,dr ≈ sqrt(N_β + (Y_β·N_r)/U0)
  ζ_dr   ≈ −(N_r + Y_β/U0) / (2·ω_n,dr)
  ```
- **Spiral mode** — slow, first-order, often only marginally stable or mildly divergent in real aircraft (this is normal and expected — it's why airplanes need occasional bank correction in cruise): `τ_spiral ≈ −Δ_spiral / (g·(L_β·N_r − L_r·N_β))` (see `docs/equations.md` for the full determinant expansion).

### 6.4 Interactive Stick-and-Rudder Response

Real-time control loop, driven directly by user input (keyboard arrow keys / on-screen virtual stick / gamepad):

```
δe = stickPitch · δe_max        // elevator, typically ±25°
δa = stickRoll  · δa_max        // aileron, typically ±20°
δr = pedalYaw   · δr_max        // rudder, typically ±25°
```

Integrate `ẋ_lon` and `ẋ_lat` independently (they're decoupled by construction in the linear model) at a fixed real-time timestep (RK4, `dt = 1/60 s` to match display refresh), and drive:

- An **attitude indicator** widget from `θ` and `φ`.
- A **time-history strip chart** of `α, β, p, q, r` scrolling in real time.
- A **mode excitation view**: canned "doublet" input buttons (brief elevator or rudder pulse) that excite short-period/phugoid or dutch-roll/spiral modes in isolation, so the user can directly see textbook mode shapes emerge from their own stick input — this is the single most pedagogically valuable feature of this module and should be a first-class UI element, not an afterthought.

### 6.5 Outputs

Real-time state trace, plus on-demand modal analysis readout (natural frequency, damping ratio, and time-to-double/time-to-half for every mode) computed directly from the eigenvalues of the current `A_lon`/`A_lat`, so the numbers update live if the user changes trim condition or loads a different aircraft's derivative set.

---

## 7. Module D — Landing Simulator

An interactive powered-descent simulator that lets you pick a reentry state and watch the rocket execute a suicide-burn landing in real time. It sits entirely in `apps/web/src/features/landing-sim/` and reuses the physics and guidance code from Module A (`packages/rocket-sim/src/guidance/landing.ts`).

### 7.1 User Flow

1. **Setup mode** — an SVG entry-point selector shows a speed (150–800 m/s) × altitude (6–25 km) plot. A background Web Worker streams a capture-region sweep into the plot as you interact: cells shade green (lands on pad), amber (misses pad), or red (crashes), so you can see at a glance which entry states are recoverable before committing to a run. Sliders below control flight-path angle γ (−88° to −35°) and horizontal downrange offset (0–8 km). The sweep re-runs (debounced 300 ms) whenever γ, downrange, or propellant load change — the grid axes are speed and altitude, so dragging the entry point never invalidates it.

2. **Launch** — clicking Launch posts the chosen state to the worker, which runs the full descent headless in a fixed-timestep integrator and returns a complete telemetry recording (sampled every 2 simulation steps).

3. **Flight mode** — the recording plays back on a 2D canvas with warp controls (1×/2×/5×/10×) and a scrub slider. A live telemetry dashboard updates every frame. The landing verdict is pre-computed from the finished run but revealed only when playback reaches touchdown, so the outcome unfolds in real time.

### 7.2 Guidance Law

The suicide-burn controller (`poweredDescentGuidance`) has three phases:

| Phase | Trigger | What the controller does |
|---|---|---|
| **Coast** | Before ignition | Throttle 0; no gimbal authority. |
| **Ignition** | `h ≤ v²/(2·a_max) · (1 + margin)` | Latched — engine never restars. Design deceleration `a_d = a_max / (1 + margin)` frozen at this moment. |
| **Powered descent** | After ignition | Vertical: feedforward + PID tracks profile `v_cmd(h) = −√(v_td² + 2·a_d·h)`. Horizontal: position PIDs command a bounded nose tilt (≤ `maxTiltRad`), fed through the attitude controller to the gimbal. |

The vertical feedforward is `throttle_ff = m·(g + a_d·clamp(ḣ/v_cmd, 0, 1.5)) / T_rated`, with a PID error term trimming the residual. All parameters (`ratedThrustN`, `ignitionMargin`, `touchdownSpeedMps`, `maxTiltRad`, PID gains) come from `config.control.descent` — nothing hardcoded.

### 7.3 Canvas Visualization

The canvas (`LandingCanvas`) renders at 760 × 520 px, redrawn every `requestAnimationFrame`:

- **Sky** — linear blend from day blue at sea level to near-black at 20 km+ (altitude-driven).
- **Ground & pad** — ground strip appears once it enters the camera window; landing pad drawn as a semicircular arc at north = 0.
- **Rocket silhouette** — body + nose cone + fins at true pitch angle θ; landing legs deploy visually below 150 m AGL.
- **Engine flame** — throttle-scaled triangle gradient at the tail, deterministic `sin(40·t)` flicker (replay-identical, no `Math.random()`).
- **Touchdown visuals** — failure modes get distinct animations (RUD destroys the silhouette; others freeze in the crashed pose with verdict chip).

Camera follows the vehicle: at high altitude it zooms out, zooming in as the rocket approaches the pad.

### 7.4 Telemetry Dashboard

A live HUD panel (`Dashboard`) reads from the current playback sample and shows:

- **Phase label** — `FREEFALL` / `ENTRY BURN` / `LANDING BURN` / `TOUCHDOWN`, derived from the recorded phase transition timestamps.
- **T− countdown** — exact (the recording is complete, so no extrapolation).
- **12-field stat grid**: altitude (m AGL), vertical speed, horizontal speed, total speed, Mach, dynamic pressure q̄ (kPa), g-load, throttle %, propellant remaining %, pitch angle θ, gimbal δp, gimbal δy.

### 7.5 Verdict System

After a run, `classifyLanding` evaluates the finished telemetry with a priority-ordered ladder (first match wins):

| Verdict | Condition |
|---|---|
| `rud` | Impact speed > `rudImpactSpeedMps` (default 25 m/s) |
| `out-of-propellant` | Tanks dry **and** touchdown Vz still above limit |
| `hard-landing` | Touchdown Vz > `touchdownVzMaxMps` (default 2 m/s) |
| `tip-over` | Tilt from vertical at touchdown > `touchdownTiltMaxRad` (default 5°) |
| `missed-pad` | Miss distance > `padRadiusM` (default 15 m) |
| `success` | All limits met |

All thresholds are config-driven (`config.control.landingTarget`). The verdict chip is revealed with a color-coded tone (green / amber / red) only when playback reaches touchdown.

### 7.6 File Layout

```
apps/web/src/features/landing-sim/
├── LandingSimView.tsx      # top-level: setup ↔ flight state machine, worker lifecycle
├── EntryPointSelector.tsx  # SVG drag plot + γ/downrange sliders + capture grid
├── LandingCanvas.tsx       # canvas renderer: sky, ground, pad, rocket, flame, verdict
├── Dashboard.tsx           # live telemetry HUD + phase/countdown
├── verdict.ts              # classifyLanding() pure function
├── usePlayback.ts          # warp/scrub/play/pause/replay hook
├── playbackMath.ts         # frame interpolation, derived quantities (Mach, q̄, g-load…)
├── camera.ts               # world-to-screen projection, zoom-to-altitude logic
└── types.ts                # EntryInputs, CaptureGrid, Verdict, PhaseLabel, PhaseTimes

packages/rocket-sim/src/guidance/landing.ts   # poweredDescentGuidance() physics
tests/unit/landing-guidance.test.ts           # unit tests: capture region, touchdown convergence
```

---

## 8. Tech Stack & Architecture

**Recommended primary stack: TypeScript end-to-end.**

- **`physics-core`, `atmosphere-models`, and all three `*-sim` packages**: pure TypeScript, framework-agnostic, no DOM dependencies. This lets the exact same deterministic physics run in the browser (for the interactive UI) and in Node (for the offline validation test suite) with zero divergence between "what was tested" and "what ships."
- **Numerical work**: hand-rolled RK4/RK45 (small, easy to unit-test, no need for a heavy numerics dependency) plus a minimal linear-algebra helper (3-vectors, quaternions, 3x3 and 4x4 matrices) written in-house rather than pulled in as a dependency, since the matrix sizes involved are small and fixed.
- **Front-end**: React + Three.js/`@react-three/fiber` for 3D trajectory visualization (rocket ascent/descent path, reentry ground track over a globe), and a charting library (Recharts or D3) for telemetry strip charts and the reentry corridor plot.
- **Real-time loop**: `requestAnimationFrame`-driven fixed-timestep accumulator pattern (decouple physics tick rate from render rate) for Module C's interactive response and Module A's real-time landing-burn visualization.
- **Offline/batch runs** (full ascent-to-apogee, full corridor sweep for Module B): can run physics headless in a Web Worker so the UI thread stays responsive, then stream results to the charts.

**Why not Python for the core physics:** Python (numpy/scipy) is a perfectly reasonable *alternative* if this project is meant to live as research notebooks rather than an interactive web tool — and is worth using for generating/validating the aero and stability-derivative data tables offline (e.g. a `scripts/generate-aero-table.py` using a vortex-lattice or DATCOM-style method) — but since Module C's core deliverable is explicitly an *interactive* stick-and-rudder response, and the project overall reads as a browser-facing simulator, keeping the runtime physics in TypeScript avoids a Python-backend-plus-WebSocket round-trip for something that needs to feel like a game control loop.

### Module Interfaces (illustrative signatures)

```typescript
// packages/physics-core
export interface Integrator {
  step<S>(deriv: (t: number, x: S, u: unknown) => S, t: number, x: S, u: unknown, dt: number): S;
}

// packages/rocket-sim
export interface RocketState { r: Vec3; v: Vec3; q: Quat; omega: Vec3; mass: number; }
export interface RocketConfig { /* see Section 8.1 */ }
export function derivRocket(t: number, x: RocketState, config: RocketConfig, controls: GimbalCommand): RocketState;

// packages/reentry-sim
export interface ReentryState { V: number; gamma: number; psi: number; h: number; lat: number; lon: number; }
export function derivReentry(t: number, x: ReentryState, config: ReentryConfig, bank: number): ReentryState;
export function findEntryCorridor(vConfig: ReentryConfig, vEntryRange: [number, number]): CorridorCurve;

// packages/aircraft-sim
export interface AircraftDerivatives { /* see Section 8.3 */ }
export function buildLonStateSpace(deriv: AircraftDerivatives, trim: TrimCondition): { A: Matrix4; B: Matrix4x2 };
export function buildLatStateSpace(deriv: AircraftDerivatives, trim: TrimCondition): { A: Matrix4; B: Matrix4x2 };
export function modalAnalysis(A: Matrix4): ModeReport[]; // eigenvalues -> wn, zeta, t_double/t_half
```

---

## 9. Data Schemas

### 8.1 Rocket Vehicle Config (`data/*.rocket.yaml`)

```yaml
name: "Reference TVC Booster"
mass:
  dry_kg: 2200
  propellant_kg: 8800
  dry_cg_from_nose_m: 6.1
  propellant_cg_from_nose_m: 4.8   # at full load; interpolated toward tank-bottom as it drains
  dry_inertia_kgm2: { Ixx: 450, Iyy: 18500, Izz: 18500 }
geometry:
  length_m: 12.0
  diameter_m: 1.2
  ref_area_m2: 1.131
propulsion:
  thrust_curve_file: "data/thrust-curves/booster_main.csv"
  isp_sea_level_s: 282
  isp_vacuum_s: 311
  gimbal:
    max_deflection_deg: 6.0
    max_slew_rate_dps: 20
    position_from_nose_m: 11.8
aero:
  table_file: "data/aero-tables/booster_aero.csv"
  cp_from_nose_m: 5.4   # nominal, may itself be Mach-dependent in the table
control:
  pid_pitch: { kp: 0.8, ki: 0.05, kd: 0.6 }
  pid_yaw:   { kp: 0.8, ki: 0.05, kd: 0.6 }
  guidance_mode: "powered_descent"
  landing_target: { lat: 0.0, lon: 0.0, touchdown_vz_max_mps: 2.0 }
```

### 8.2 Reentry Vehicle Config (`data/*.reentry.yaml`)

```yaml
name: "Generic Capsule"
mass_kg: 4200
ref_area_m2: 12.0
nose_radius_m: 0.9
hypersonic:
  cd: 1.4
  cl_over_cd: 0.24
limits:
  max_heat_flux_w_m2: 1.0e6
  max_g_load: 8.0
entry_interface_altitude_m: 120000
```

### 8.3 Aircraft Derivative Set (`data/*.aircraft.yaml`)

```yaml
name: "Generic Light Single-Engine"
geometry: { wing_area_m2: 16.2, chord_m: 1.49, span_m: 10.9 }
mass: { mass_kg: 1100, Iyy_kgm2: 1350, Ixx_kgm2: 900, Izz_kgm2: 2100 }
trim: { U0_mps: 60, theta0_deg: 0, altitude_m: 1000 }
longitudinal_derivatives_nondim:
  CL_alpha: 4.4
  CD_alpha: 0.35
  Cm_alpha: -0.89
  Cm_q: -12.4
  Cm_alpha_dot: -4.2
  Cm_delta_e: -1.28
lateral_derivatives_nondim:
  CY_beta: -0.393
  Cl_beta: -0.0923
  Cn_beta: 0.0587
  Cl_p: -0.484
  Cn_r: -0.0937
  Cl_delta_a: 0.229
  Cn_delta_r: -0.0645
```

---

## 10. UI / Visualization Spec

- **Module A (Rocket):** 3D trajectory view (ascent arc + optional boostback/landing burn), live attitude/gimbal-deflection readout, telemetry strip charts (altitude, velocity, Mach, q̄, static margin), a "max-Q" and "max-g" marker overlay, and — critically — a landing-leg touchdown view (velocity vector, lateral offset, touchdown g) if descent mode is active.
- **Module B (Reentry):** altitude-vs-velocity trajectory plot, heat-flux and g-load time histories with limit lines drawn in, ground-track map, and the signature **entry corridor chart** (`γ_entry` on Y, `V_entry` on X, shaded valid band between skip-out and burn-up curves, with the current run's entry point plotted as a marker — dragging it should let the user see in real time whether they're inside or outside the corridor).
- **Module C (Aircraft):** attitude indicator (artificial horizon), virtual stick/rudder input widget (also bindable to keyboard/gamepad), scrolling strip charts for `α, β, p, q, r, φ, θ`, and the live modal-analysis readout (table of mode name, `ω_n`, `ζ`, `t_half`/`t_double`) plus one-click "doublet" excitation buttons per mode.
- **Module D (Landing Sim):** drag-to-pick SVG entry-point selector with a streaming capture-region background grid (speed × altitude, shaded green/amber/red); γ and downrange sliders; 2D canvas flight view with warp (1×/2×/5×/10×) and scrub controls; live telemetry HUD (phase label, T− countdown, 12-field stat grid); and a color-coded verdict chip (success / hard-landing / tip-over / missed-pad / out-of-propellant / RUD) revealed at touchdown.

Follow standard aerospace sign/color conventions throughout (nose-up positive pitch, right-wing-down positive roll, standard rate turn indicators) so the visuals read correctly to anyone with flight-sim or aero background.

---

## 11. Validation & Test Suite

Every module must pass validation against a known analytical or textbook case before being considered "correct," independent of any visual polish:

1. **Physics-core:** unit tests for quaternion normalization drift over long integration runs, RK4 vs. RK45 agreement on a simple harmonic oscillator, and atmosphere model spot-checks against published US76 tables at several altitudes.
2. **Module A:**
   - Zero-thrust, zero-drag point mass in uniform gravity must match the closed-form parabolic trajectory to within numerical tolerance (validates the integrator + gravity term in isolation).
   - A vehicle with zero static margin should be neutrally stable in pitch (no restoring moment) — confirms CP/CG bookkeeping.
   - PID gimbal control: given a step attitude-error input, the closed-loop response should show damped second-order behavior consistent with the configured gains (compare simulated settling time against the linearized closed-loop transfer function).
   - Landing-burn guidance: touchdown vertical velocity must converge below the configured `touchdown_vz_max_mps` across a range of initial altitudes/velocities within the guidance law's designed capture region.
3. **Module B:**
   - A pure ballistic drop (`L = 0`) at a steep entry angle should show peak deceleration g-load and peak heat flux occurring near-simultaneously, consistent with classical ballistic-entry theory.
   - The corridor-finding bisection must converge to the same boundary regardless of starting bracket (test with multiple initial brackets).
   - Sutton-Graves output spot-checked against a hand-calculated value for a simple round-number case (e.g. `ρ = 1e-4 kg/m³`, `V = 7000 m/s`, `R_n = 1 m`).
4. **Module C:**
   - Eigenvalues of `A_lon`/`A_lat` for a textbook reference aircraft's published derivative set should reproduce that aircraft's documented short-period/phugoid/dutch-roll/spiral characteristics within a reasonable tolerance band.
   - Step response to a small elevator doublet should show a fast, well-damped short-period transient followed by a slow, lightly-damped phugoid — visually and numerically distinct timescales, confirming mode separation.
   - Symmetry check: identical positive/negative aileron doublets should produce mirror-image roll responses (confirms no sign-convention bugs in `B_lat`).
5. **Module D (Landing Sim):**
   - Touchdown vertical velocity must converge below `touchdownVzMaxMps` across the full green region of the capture-region grid (confirmed by `tests/unit/landing-guidance.test.ts`).
   - Ignition trigger: for a zero-margin case (`ignitionMargin = 0`), the engine must ignite exactly when `h = v²/(2·a_max)`, and the vehicle must reach ground with near-zero residual velocity.
   - Out-of-propellant verdict: a run with a minimal propellant load that cannot complete the burn must be classified `out-of-propellant`, not `hard-landing`.
   - Capture-region sweep determinism: identical (γ, downrange, propellant) inputs must produce a bit-identical cell grid on every re-sweep (confirms no wall-clock or random-number dependencies in the physics loop).

---

## 12. Build Roadmap

**Phase 0 — Foundations.** `physics-core` (vectors/quaternions/integrators) + `atmosphere-models`, fully unit-tested in isolation, no UI yet.

**Phase 1 — Aircraft module first.** It's linear, has no variable mass/inertia, and no control loop to tune — the fastest path to an end-to-end validated result and a good smoke test for the whole pipeline (state-space build → integrate → modal analysis → chart).

**Phase 2 — Rocket ascent (open-loop).** 6-DOF integration, thrust curve, aero table, variable mass/inertia, gravity-turn open-loop ascent — validate apogee/trajectory before adding any control loop.

**Phase 3 — Rocket TVC control loop.** Add the PID gimbal controller and attitude-hold guidance mode; validate closed-loop step response against the linearized prediction.

**Phase 4 — Landing Simulator. ✓ Complete.** Suicide-burn guidance (`poweredDescentGuidance`), interactive entry-point selector with streaming capture-region grid, canvas flight view with warp/scrub playback, live telemetry HUD, and a six-way verdict system. Physics validated and UI shipped in `apps/web`.

**Phase 5 — Reentry module.** 3-DOF integration, heating model, then the corridor bisection search and corridor chart.

**Phase 6 — UI integration & polish.** 3D trajectory views, real-time stick-and-rudder input binding, doublet-excitation buttons, corridor chart interactivity.

**Phase 7 (stretch) — Cross-module extras.** J2 gravity, convex-optimization powered-descent guidance, radiative heating for high-speed reentry, nonlinear 6-DOF aircraft model as a Module C upgrade path.

---

## 13. Symbol Glossary

| Symbol | Meaning | Symbol | Meaning |
|---|---|---|---|
| `α` | angle of attack | `β` | sideslip angle |
| `γ` | flight path angle | `σ` | bank angle (reentry) |
| `φ, θ, ψ` | roll, pitch, yaw (Euler) | `p, q, r` | body-axis roll/pitch/yaw rates |
| `q̄` | dynamic pressure | `ρ` | air density |
| `Cd, Cl, Cm` | drag/lift/pitching-moment coefficients | `C_A, C_N` | axial/normal force coefficients (body axis) |
| `Isp` | specific impulse | `ṁ` | mass flow rate |
| `δp, δy` | pitch/yaw gimbal deflection | `δe, δa, δr` | elevator, aileron, rudder deflection |
| `X_u, Z_α, M_q`, etc. | dimensional stability derivatives | `ω_n, ζ` | natural frequency, damping ratio |
| `q̇_s` | stagnation-point heat flux | `n_load` | load factor (g's) |
| `β_bc` | ballistic coefficient | `R_n` | nose radius |

---

## 14. References

- Etkin, B. & Reid, L. D., *Dynamics of Flight: Stability and Control* — the standard reference for the linearized aircraft equations in Section 6.
- Sutton, G. & Biblarz, O., *Rocket Propulsion Elements* — thrust curve and Isp modeling.
- Anderson, J. D., *Hypersonic and High-Temperature Gas Dynamics* — Sutton-Graves heating and entry-corridor theory.
- U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF) — atmosphere model tables.
- Vallado, D., *Fundamentals of Astrodynamics and Applications* — rotating-Earth reentry equations of motion.
- Barrowman, J., *The Practical Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles* — CP estimation method for the rocket aero table.

---

### Notes for the implementation agent

Build strictly in the order given in Section 11 — do not start the interactive UI before Phase 1's aircraft module has passing validation tests, since the UI's real-time loop is much easier to debug against a model you already trust. When in doubt about a sign convention, follow standard aerospace body-axis convention (X-forward, Y-right, Z-down; positive pitch nose-up) throughout every module, and document any deviation explicitly in `docs/equations.md` rather than silently diverging between modules.
