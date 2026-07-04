# Equations, Derivations & Sign Conventions

This document records the exact math, sign conventions, and assumptions behind
every physics package, so that no module silently diverges from another (README
Section 1 & "Notes for the implementation agent"). It grows one chapter per
build phase.

---

## Phase 0 — Shared Foundations

Implements README Section 3. Packages: `physics-core`, `atmosphere-models`.

### Tooling note (deviation from plan.md)

`plan.md` proposed **pnpm** workspaces as a "low-friction default." The build
environment has Node + npm but neither `pnpm` nor `corepack`, so this repo uses
**npm workspaces** instead — identical package/test layout, one fewer thing to
install. All plan/README verification commands map directly:

| plan.md command | this repo |
|---|---|
| `pnpm vitest run tests/unit` | `npm test` (or `npx vitest run`) |
| `pnpm --filter <pkg> ...` | `npm run <script> -w <pkg>` |

Everything else follows `plan.md` Phase 0 exactly (file breakdown, exports,
dependencies) and README Section 3 for the physics.

### 3.1 Quaternion kinematics and rotations

Scalar-first unit quaternion `q = [q0, q1, q2, q3]`, `‖q‖ = 1`. The README gives
the body-rate kinematic equation verbatim:

```
q̇ = ½ · Ω(ω) · q
Ω(ω) = [[ 0, -p, -q, -r],
        [ p,  0,  r, -q],
        [ q, -r,  0,  p],
        [ r,  q, -p,  0]]      ω = (p, q, r) in the BODY frame
```

`qderiv(q, ω)` implements this matrix product literally. It is algebraically
identical to `q̇ = ½ · q ⊗ [0, ω]` (Hamilton product, ω as a pure quaternion) —
verified in `quat.test.ts`. This is the standard aerospace convention
(Stevens & Lewis, *Aircraft Control and Simulation*).

**Direction cosine matrix.** `qtoDCM(q)` returns the **NED → body** passive
rotation `C_{b/n}` consistent with the kinematics above (so `v_body = C · v_ned`):

```
C_{b/n}(q) =
[ q0²+q1²-q2²-q3²   2(q1q2+q0q3)     2(q1q3-q0q2)   ]
[ 2(q1q2-q0q3)      q0²-q1²+q2²-q3²  2(q2q3+q0q1)   ]
[ 2(q1q3+q0q2)      2(q2q3-q0q1)     q0²-q1²-q2²+q3² ]
```

- `rotateNEDtoBody(q, v) = C · v`
- `rotateBodyToNED(q, v) = Cᵀ · v` (Cᵀ is orthonormal, so this is the exact inverse)

**Euler 3-2-1 (yaw ψ → pitch θ → roll φ).** `qfromEuler321` / `qtoEuler321` use
the standard aerospace half-angle formulas such that
`qtoDCM(qfromEuler321(φ,θ,ψ)) = Rx(φ)·Ry(θ)·Rz(ψ)`:

```
θ = asin( 2(q0q2 − q1q3) )
φ = atan2( 2(q2q3 + q0q1),  q0²−q1²−q2²+q3² )
ψ = atan2( 2(q1q2 + q0q3),  q0²+q1²−q2²−q3² )
```

Pitch is clamped to ±90°; near the θ = ±90° gimbal singularity the Euler readout
degrades (expected — the quaternion state itself never does).

### 3.3 Gravity

`gravityAtAltitude(h) = g0 · (Re / (Re + h))²`, magnitude only (points along
+Down in NED). Constants `g0 = 9.80665 m/s²`, `Re = 6 371 000 m`.
`j2Acceleration` is a Phase-7 stub returning the zero vector.

### 3.4 Numerical integration

- `rk4Step` — classic fixed-step RK4.
- `rk45Step` — Dormand–Prince 5(4), returns the 5th-order state plus the
  embedded 4th-order error estimate.
- `integrateFixed` — RK4 loop to `tEnd`/`steps`, optional terminal event.
- `integrateAdaptive` — PI-free elementary step-size control on the DP error
  norm, `dt ∈ [dtMin, dtMax]`, `dtMin` default `1e-3 s`.
- **Events:** a `terminate(t, x)` returning a scalar event function `g` is
  monitored for sign changes; on a crossing the step is bisected in time to
  `eventTol` and the refined state/time is returned. Deterministic — no
  wall-clock, no randomness (README §1).

### 3.2 Atmosphere (US Standard Atmosphere 1976)

`us76.atmosphere(hGeometric)` — 7-layer piecewise model, 0–86 km, returning
`{ T, p, rho, a, inVacuum }`.

- Geometric → geopotential conversion uses the US76 effective radius
  `r0 = 6 356 766 m` (distinct from the gravity `Re`): `H = r0·h / (r0 + h)`.
- Layer base geopotential altitudes / base temperatures / lapse rates:

  | layer | H_base (m) | T_base (K) | L (K/m) |
  |---|---|---|---|
  | 0 | 0     | 288.15 | −0.0065 |
  | 1 | 11000 | 216.65 |  0.0    |
  | 2 | 20000 | 216.65 | +0.0010 |
  | 3 | 32000 | 228.65 | +0.0028 |
  | 4 | 47000 | 270.65 |  0.0    |
  | 5 | 51000 | 270.65 | −0.0028 |
  | 6 | 71000 | 214.65 | −0.0020 |

- Within a layer: `T = T_base + L·(H − H_base)`.
  Pressure (hydrostatic + ideal gas, `R = R_air = 287.05 J/kg·K`, `g0`):
  - `L ≠ 0`: `p = p_base · (T_base / T)^(g0 / (R·L))`
  - `L = 0`: `p = p_base · exp(−g0·(H − H_base) / (R·T))`
  Base pressures are derived once by integrating upward from
  `p0 = 101 325 Pa`, so the profile is continuous by construction.
- `ρ = p / (R·T)`, `a = √(γ·R·T)`.

**Exponential extension (> 86 km).** `exponentialExtension(h)` continues density
above the 86 km handoff (README §3.2):

```
ρ(h) = ρ86 · exp( −(h − h86) / H_scale ),   H_scale = R·T86 / g0  (≈ 5.5 km)
```

with `ρ86, T86` taken from `us76` evaluated at the 86 km boundary, so density is
C0-continuous across the handoff. `T = T86`, `p = ρ·R·T`, `a = √(γ·R·T)`.
`inVacuum` is set once `ρ` drops below a configurable threshold
(default `1e-9 kg/m³`).

**Unified dispatch.** `atmosphere(h)` (package index) routes `h ≤ 86 km` to
`us76` and `h > 86 km` to the exponential extension.

**Wind.** `windAtAltitude(profile, h)` supports `constant`, linear `shear`
(base + gradient·(h − h0)), and interpolated `table` profiles, returning an
NED vector added to freestream before α/β/q̄ are computed.

---

## Phase 1 — Linearized aircraft model (`aircraft-sim`)

Implements README Section 6 (Module C): the Etkin-style small-perturbation
longitudinal and lateral-directional state-space model about a trimmed flight
condition. Depends on `physics-core` (`eig4x4`, `rk4Step`, `G0`, `degToRad`) and
`atmosphere-models` (ρ0 at the trim altitude).

### 6.1 State, control, and sign conventions

- **Longitudinal** state `x_lon = [Δu, α, q, θ]`, controls `u_lon = [δe, δt]`.
  `Δu` is the **dimensional** airspeed perturbation (m/s). README §6.2's prose
  labels the first state `û = Δu/U0`, but the A_lon matrix it writes out is the
  dimensional-Δu form (its row-1 gravity entry is `−g·cosθ0` and its row-2 col-1
  is `Z_u/U0` — both only consistent when the first state carries units of m/s).
  We match the matrix exactly. The scaling choice is a similarity transform
  `A' = D⁻¹AD`, `D = diag(1, U0, 1, 1)`, so **eigenvalues are identical** under
  either convention.
- **Lateral** state `x_lat = [β, p, r, φ]`, controls `u_lat = [δa, δr]`. β, φ in
  rad; p, r in rad/s.
- Body axes X-fwd/Y-right/Z-down; `α ≈ w/U0`, `β ≈ v/U0` (small angles). Gravity
  uses the `G0` constant (README §3.5). θ0 is stored in radians (the loader
  converts `theta0_deg`).
- Rolling/yawing dimensional derivatives are named `Lbeta`, `Nbeta`, … (never a
  bare `L`) to avoid the lift/rolling-moment symbol collision (README §6.3 note).

### 6.2 Non-dimensional → dimensional conversion (`dimensionalize.ts`)

With trim dynamic pressure `q̄0 = ½·ρ0·U0²`, `q̄S = q̄0·S`, and standard rate
non-dimensionalisations (`c̄/(2U0)` longitudinal, `b/(2U0)` lateral):

```
Longitudinal (÷ m, ÷ m·U0, ÷ Iyy):
  Xu = −(C_Du + 2·C_D0)·q̄S/(m·U0)     Xα = (C_L0 − C_Dα)·q̄S/m
  Zu = −(C_Lu + 2·C_L0)·q̄S/(m·U0)     Zα = −(C_Lα + C_D0)·q̄S/m
  Zq = −C_Lq·q̄S·c̄/(2·m·U0)
  Mu = C_mu·q̄S·c̄/(U0·Iyy)             Mα = C_mα·q̄S·c̄/Iyy
  Mα̇ = C_mα̇·q̄S·c̄²/(2·U0·Iyy)         Mq = C_mq·q̄S·c̄²/(2·U0·Iyy)
  Zδe = −C_Lδe·q̄S/m   Mδe = C_mδe·q̄S·c̄/Iyy   Xδt (direct-thrust, A2)

Lateral (÷ m, ÷ Ixx, ÷ Izz):
  Yβ = C_Yβ·q̄S/m       Yp = C_Yp·q̄S·b/(2mU0)     Yr = C_Yr·q̄S·b/(2mU0)
  Lβ = C_lβ·q̄S·b/Ixx   Lp = C_lp·q̄S·b²/(2U0·Ixx)  Lr = C_lr·q̄S·b²/(2U0·Ixx)
  Nβ = C_nβ·q̄S·b/Izz   Np = C_np·q̄S·b²/(2U0·Izz)  Nr = C_nr·q̄S·b²/(2U0·Izz)
  Lδa,Nδr,… analogous;  Yδa/Yδr = C_Yδ·q̄S/m
```

`Mα̇` is the **α̇** derivative (`= U0·M_ẇ`), matching the way README §6.2 writes
its coupling terms.

### 6.3 State-space assembly (`stateSpace.ts`)

Longitudinal (README §6.2), state `[Δu, α, q, θ]`:

```
A_lon =
[ Xu               Xα                0                −g·cosθ0     ]
[ Zu/U0            Zα/U0             1 + Zq/U0        −g·sinθ0/U0  ]
[ Mu + Mα̇·Zu/U0    Mα + Mα̇·Zα/U0     Mq + Mα̇·(1+Zq/U0)   0        ]
[ 0                0                 1                 0           ]

B_lon =                              (controls [δe, δt])
[ Xδe              Xδt ]
[ Zδe/U0           0   ]
[ Mδe + Mα̇·Zδe/U0  0   ]     ← M_α̇ coupling folded into row 3 of B as well
[ 0                0   ]
```

The `M_α̇` coupling appears in row 3 of **both** A and B (Etkin; A2). The
strictly-correct `(3,4)` entry `−M_ẇ·g·sinθ0` is dropped to match README's `0`
(exactly zero for level trim, θ0 = 0).

Lateral (README §6.3), state `[β, p, r, φ]`:

```
A_lat =
[ Yβ/U0   Yp/U0    Yr/U0 − 1    g·cosθ0/U0 ]
[ Lβ      Lp       Lr           0          ]
[ Nβ      Np       Nr           0          ]
[ 0       1        tanθ0        0          ]

B_lat =            (controls [δa, δr])
[ Yδa/U0  Yδr/U0 ]
[ Lδa     Lδr    ]
[ Nδa     Ndr    ]
[ 0       0      ]
```

Product-of-inertia (Ixz) coupling is neglected — README writes pure-aero L/N
rows and §8.3 provides no Ixz.

### 6.4 Modal analysis (`modal.ts`)

`modalAnalysis(A)` uses `eig4x4`, collapses complex-conjugate pairs into single
oscillatory modes, and classifies from eigenvalue **structure**: two oscillatory
pairs → longitudinal (higher ω_n = short-period, lower = phugoid); one pair +
two real roots → lateral (pair = dutch-roll, faster real = roll, slower =
spiral). For each mode: `ω_n = |λ|`, `ζ = −Re(λ)/ω_n`, damped period
`2π/|Im(λ)|`, and time to half/double `ln2/|Re(λ)|` (doubling when Re(λ) > 0).

Closed-form approximations (UI readout + sanity cross-check, README §6.2/§6.3):

```
short-period:  ω_n = √(Mq·Zα/U0 − Mα)     ζ = −(Mq + Zα/U0 + Mα̇)/(2ω_n)
phugoid:       ω_n = g·√2/U0              ζ = 1/(√2·(L/D)_trim),  L/D = C_L0/C_D0
dutch-roll:    ω_n = √(Nβ + Yβ·Nr/U0)     ζ = −(Nr + Yβ/U0)/(2ω_n)
roll:          τ_roll = −1/Lp
spiral:        τ_spiral = −1/λ_s,  λ_s = (Lβ·Nr − Lr·Nβ)/Lβ
```

Spiral stability (convergent when `Lβ·Nr − Lr·Nβ > 0`, given Lβ < 0) is reliable;
its magnitude approximation is famously poor, so the validation only cross-checks
the spiral's **sign**, not its time constant.

### 6.5 Simulation (`simulate.ts`)

The two channels are decoupled by construction, so `AircraftSim` integrates each
4-state system independently with the shared fixed-step RK4 at `dt = 1/60 s`
(README §6.4). `doubletInput(t0, width, amp)` returns `+amp` on `[t0, t0+width)`,
`−amp` on `[t0+width, t0+2·width)`, else 0. Deterministic — no wall-clock, no
randomness (README §1).

### Ambiguity resolutions (plan A2, A16)

- **A2** — the §8.3 schema omits several derivatives the A-matrices need. The
  loader treats them as optional, defaulting to 0, except `CL0`, which is
  computed from the level-flight trim `CL0 = m·g/(q̄0·S)` when absent. B-matrices
  (never written in the spec) are derived per Etkin with the `Mα̇·Zδe/U0`
  coupling. `Xδt` uses a simple direct-thrust model (config field, default 0).
- **A16** — the §10.4 validation reference aircraft is the **Navion** (Nelson,
  *Flight Stability and Automatic Control*), which has both a published
  non-dimensional derivative set and published mode characteristics.

### Validation (README §10.4)

Built from `data/aircraft-derivatives/navion.aircraft.yaml`, the model reproduces
the published Navion modes (`tests/validation/aircraft-modes.test.ts`):

| mode | computed (this model) | published (Nelson) |
|---|---|---|
| short-period | λ = −2.51 ± 2.59i, ω_n 3.61, ζ 0.70 | ω_n ≈ 3.6, ζ ≈ 0.69 |
| phugoid | λ = −0.017 ± 0.213i, ω_n 0.214, ζ 0.080 | ω_n ≈ 0.21, ζ ≈ 0.08 |
| dutch-roll | λ = −0.49 ± 2.35i, ω_n 2.40, ζ 0.20 | ω_n ≈ 2.4, ζ ≈ 0.20 |
| roll | λ = −8.43 (τ ≈ 0.12 s) | ≈ −8.4 |
| spiral | λ = −0.0082 (stable) | ≈ −0.009, slightly stable |

Also validated: elevator-doublet short-period/phugoid timescale separation
(`aircraft-doublet.test.ts`) and ±aileron mirror-image, roll-dominant response
(`aircraft-symmetry.test.ts`). Trap T4 (§6.2/§6.3 sign conventions, `g·cosθ0`
placement, B_lat signs) is covered by the state-space entry tests plus these
validation cases.

### Tooling note

`aircraft-sim` adds `js-yaml` (+ `@types/js-yaml`) for the derivative-set loader,
installed via npm workspaces (pnpm remains unavailable in this environment — see
the Phase 0 tooling note above).

---

## Phase 2 — Rocket ascent, open-loop (`rocket-sim`)

Implements README Section 4 (Module A) through the open-loop gravity-turn ascent:
full 6-DOF integration with a thrust curve, an aero table, variable mass /
inertia, and a gravity-turn guidance law with **zero active feedback** (PID/TVC
control and powered descent are Phases 3–4). Depends on `physics-core`
(quaternions, `rk4Step`, `m3*`, gravity, constants) and `atmosphere-models`
(density/pressure/speed-of-sound and wind).

### 4.1 State and frames

State `x = [r_NED(3), v_body(3), q(4), ω_body(3), m(1)]` (14 scalars,
`state.ts`). Body axes X-forward (nose) / Y-right / Z-down (README §3.1); the
quaternion is NED→body (scalar-first). Altitude `h = −r_NED.z`. On the pad the
vehicle points up, so the initial attitude is a 90° nose-up pitch,
`q = qfromEuler321(0, π/2, 0)`: then body +X maps to −Z_NED (up), thrust (+X)
lifts, and gravity (+Z_NED) resolves to −X_body (opposing thrust).

### 4.2 Equations of motion (`deriv.ts`)

```
Translational:  m·(v̇_body + ω×v_body) = F_aero + F_thrust + R(q)·g_NED
                v̇_body = (F_aero + F_thrust + F_grav_body)/m − ω×v_body
Rotational:     I·ω̇ + ω×(I·ω) = M_aero + M_thrust
                ω̇ = I⁻¹·(M_aero + M_thrust − ω×(I·ω))
Kinematics:     ṙ_NED = R(q)ᵀ·v_body = rotateBodyToNED(q, v_body)
                q̇ = ½·Ω(ω)·q = qderiv(q, ω)
                ṁ = −ṁ_prop
```

- `R(q)·g_NED` is `rotateNEDtoBody(q, {0,0,m·g(h)})`; gravity magnitude is the
  inverse-square `gravityAtAltitude(h)` (README §3.3), pointing +Down.
- **A10** — the `İ·ω` term (mass/inertia varying) is dropped: standard
  quasi-static practice. The inertia tensor is nonetheless recomputed every
  sub-step from the instantaneous propellant load, so `I·ω̇` and the gyroscopic
  `ω×(I·ω)` use current values.
- Controls (gimbal δp/δy, throttle) are held constant across the four RK4
  sub-steps (zero-order hold), so the run stays deterministic (README §1).

### 4.3 Aerodynamics (`aero.ts`)

```
V_rel = v_body − wind_body           (wind_body = R(q)·wind_NED, plan A15)
q̄ = ½·ρ(h)·|V_rel|²   Mach = |V_rel|/a(h)
α = atan2(w_rel, u_rel)   β = asin(v_rel/|V_rel|)
F_aero_body = q̄·S·[−C_A, C_Y, −C_N]
```

Coefficients come from a `[Mach, AoA_deg, CA, CN, Cm, CY, Cl, Cn, Clp, Cmq, Cnr]`
table by **bilinear interpolation** on a complete (Mach × AoA) grid (edge-clamped
off-grid). `C_Nα` is looked up at `|α|` with the sign restored; the **side plane
reuses the normal-force curve at `|β|`** with `sign(β)` (axisymmetric assumption,
plan A12), so one table serves both planes.

**Moments are taken about the instantaneous CG** (trap T1). The normal/side
forces act at the center of pressure `X_cp`, so their moment about the CG is the
force × the (CP−CG) arm — `r_(cg→cp) = (−arm, 0, 0)`, `arm = X_cp − X_cg`:

```
M_pitch = arm·F_z (couple) + q̄·S·d·Cm (table, about CP) + q̄·S·d·Cmq·q̂
M_yaw   = −arm·F_y (couple) + q̄·S·d·Cn (table, about CP) + q̄·S·d·Cnr·r̂
M_roll  = q̄·S·d·(Cl + Clp·p̂)          p̂ = p·d/(2V), etc.
static margin = (X_cp − X_cg)/d_ref
```

The pitch couple `arm·F_z = −q̄·S·C_N·arm`: for a positive static margin (CP aft
of CG) and `+α` (`C_N > 0`) it is **negative → nose-down → restoring**; at zero
margin it vanishes → **neutral stability** (README §10.2.2). The shipped
Barrowman table sets static `Cm = Cn = 0`, so pitch/yaw restoring is carried
purely by this geometric couple — which is why zero static margin is *exactly*
neutral in the test, independent of table contents.

### 4.4 Propulsion (`propulsion.ts`)

Thrust `T(t)` is linearly interpolated from a curve (CSV or `.eng`) and is 0
outside its span. Mass flow is derived (plan A9, README §4.4):

```
Isp(h) = Isp_vac − (Isp_vac − Isp_sl)·(p(h)/p0)
ṁ = T / (g0·Isp(h))
```

`deriv.ts` scales both by throttle (plan A7) and cuts thrust and mass flow once
the propellant is exhausted (`m ≤ m_dry`).

### 4.4b Thrust-vector control (`tvc.ts`)

```
F_thrust_body = T·[ cos δp·cos δy,  sin δy,  −sin δp·cos δy ]
M_thrust_body = r_gimbal_to_cg × F_thrust_body
```

Following README §4.4 **verbatim**, `r_gimbal_to_cg` is the vector *from the
gimbal to the CG* = `(x_gimbal − x_cg, 0, 0)` (i.e. +X, forward). Combined with
the `−sin δp` thrust component this makes **`+δp` a nose-up (positive `M_y`)
moment** for the aft-mounted engine — matching the plan's trap-T4 note and giving
the consistent sign the Phase-3 PID will close around. (Note: the strictly
textbook lever about the rotation center is `r_(cg→gimbal) = −r_gimbal_to_cg`,
which would flip the sign; we adopt README's named vector as written so the whole
suite shares one convention. The Phase-2 open-loop ascent commands ~zero gimbal,
so this choice only surfaces in the sign unit-check.) The arm is recomputed from
the instantaneous CG every call (trap T2). `GimbalActuator` clamps to ±δ_max and
slew-rate-limits the change per step.

### 4.5 Mass properties (`massProperties.ts`)

Propellant modelled as a solid cylinder **draining top-down** (README §4.5,
plan A5): the column height scales with the mass fraction and the remaining slug
collects toward the tank bottom, so its CG migrates aft over the burn. Cylinder
inertia — axial `½·m·r²`, transverse `m·(3r² + h²)/12` about its own centroid.
Both the dry structure (inertia given about the dry CG, plan A6) and the
propellant cylinder are **parallel-axis transferred to the instantaneous combined
CG every step** (trap T1); the axial term needs no transfer (both bodies sit on
the longitudinal axis). Tank geometry beyond README §8.1 (`tank_bottom_from_nose_m`,
`tank_radius_m` defaulting to the vehicle radius) is the A5 extension.

### 4.6 Guidance (`guidance.ts`) and run driver (`sim.ts`)

`openLoopAscent` (README §4.6 mode 1): full throttle; a brief pitch-over kick
(a small commanded gimbal deflection over a configured window) tips the vehicle
off vertical, then zero gimbal lets the statically-stable airframe weathervane
into a gravity turn. `runRocketSim` steps fixed RK4 at `dt = 0.01 s`,
renormalizes the quaternion each step (README §10.1), holds the vehicle on the
pad until thrust exceeds weight, and stops at ground impact / `maxTime`. Summary
metrics: apogee, max Mach, max-Q, peak axial/lateral g (README §4.7).

### Reference-vehicle stability note (physics finding)

The README §8.1 reference booster is a genuine mass-properties **stress case**.
With its real geometry (1.2 m diameter, 8.8 t of propellant → an ~8 m column) and
top-down draining, the propellant CG sweeps from 4.8 m to the 8.8 m tank bottom.
Consequently the combined CG migrates aft past the CP (5.4 m) and the static
margin goes **negative around t ≈ 12 s** (≈ 7.9 t propellant remaining) — the
airframe becomes statically unstable well before burnout, and open-loop it then
diverges (tumbles). This is correct physics, not a bug: it is precisely what
motivates the Phase-3 TVC controller. The plan's narrative of "margin goes
negative *near burnout*" implicitly assumed a quasi-fixed propellant CG; under
the top-down-draining model (README §4.5 / §8.1) aft migration always brings the
crossing earlier. The golden ascent run is therefore capped at 11 s so the
regression baseline covers the stable, well-behaved gravity-turn portion; the
`mass-properties` test asserts the (correct) earlier crossing.

### Validation (README §10.2, Phase-2 subset)

| Case | Test | Result |
|---|---|---|
| §10.2.1 zero-thrust/zero-drag parabola | `rocket-ballistic.test.ts` | position matches `r0 + v0·t + ½g·t²` to ~cm over an 8 s arc |
| §10.2.2 zero static margin → neutral pitch | `rocket-neutral-stability.test.ts` | `M_y = 0` at zero margin; nose-down at +margin, nose-up at −margin; +δp nose-up (trap T4) |
| §4.5 / T1 mass properties | `mass-properties.test.ts` | analytic CG/I at full/half/empty, parallel-axis, margin crossing |
| §4.3 aero table | `aero-table.test.ts` | bilinear exact on nodes, edge clamp, α/β signs |
| §4.4 / A9 propulsion | `propulsion.test.ts` | Isp blend, ṁ = T/(g0·Isp), exhaustion cutoff |
| §1 determinism + regression | `rocket-ascent.test.ts` | bit-identical reruns; golden telemetry snapshot |

### Ambiguity resolutions (plan A5–A15)

- **A5** tank geometry added (`tank_bottom_from_nose_m`, `tank_radius_m`).
- **A6** dry inertia is about the dry CG; parallel-axis to the combined CG each step.
- **A7** throttle band added (`propulsion.throttle`, default 0.4–1.0); thrust and ṁ scale by throttle.
- **A9** ṁ derived from `T/(g0·Isp(h))`; thrust cut at propellant exhaustion.
- **A10** `İ·ω` neglected (quasi-static); inertia still recomputed each step.
- **A11** optional per-Mach CP not used by the shipped table; scalar `cp_from_nose_m` used.
- **A12** axisymmetric side plane reuses the normal-force curve at `|β|`.
- **A14** MVP flat-Earth local NED with inverse-square `g(h)`; ECI/ECEF deferred.
- **A15** wind subtracted in the body frame: `v_rel_body = v_body − R(q)·wind_NED`.

---

## Phase 3 — Rocket TVC control loop (`rocket-sim/control`)

Adds the closed-loop attitude controller (README §4.6 mode 2): per-channel PID →
gimbal actuator, driven by an `attitudeHold` guidance mode. All gains and limits
come from the config (`control.pid_pitch`/`pid_yaw`, `propulsion.gimbal`) —
nothing is hardcoded.

### 4.6a Control law (`control/pid.ts`, `control/attitudeControl.ts`)

Per channel (pitch shown; yaw identical with ψ, r, δy):

```
θ_err  = wrap(θ_cmd − θ)                          (wrapped to (−π, π])
δp_cmd = Kp·θ_err + Ki·∫θ_err dt + Kd·(−q)
δp     = rateLimit(clamp(δp_cmd, ±δ_max), δ̇_max, dt)
```

- **Derivative on measurement** (README §4.6): the derivative term is the
  measured body rate `−q` (resp. `−r`), not a differentiated error — no
  derivative kick on a commanded-attitude step, no differentiation noise. For a
  constant command, `d(θ_err)/dt = −θ̇ = −q` exactly in the pitch plane.
- **Anti-windup**: the integral state is clamped so its output contribution
  `Ki·∫θ_err dt` never exceeds the actuator authority `±δ_max`. Without the
  clamp, actuator saturation lets the integral grow without bound and the loop
  badly overshoots on recovery.
- **Roll**: no roll gimbal authority on a single engine — config-toggle stub
  (`control.roll_control_enabled`, default `false`; `true` is rejected until an
  RCS/fin model exists). README §4.6 explicitly scopes roll out of the MVP.

**Sign closure (negative feedback in both channels).** With the suite's
§4.4-verbatim moment arm `r_gimbal_to_cg = +(x_gimbal − x_cg)·x̂` (Phase 2
chapter): `+δp → F_z = −T·sinδp → M_y = −L·F_z > 0` (nose-up), and
`+δy → F_y = +T·sinδy → M_z = +L·F_y > 0` (nose-right). So a positive pitch
(yaw) error commands a moment that raises θ (ψ) toward the command, and
`Kd·(−q)`/`Kd·(−r)` oppose the rates — the §4.6 law is negative feedback as
written, in both channels, with no sign flips needed. (This is why Phase 2
standardized on the README's verbatim arm: one convention shared by the aero
couple, the gimbal moment, and now the PID.)

**Euler-singularity caveat.** θ/ψ errors come from the Euler-321 decomposition
of the NED→body quaternion, which is singular at θ = ±90°. Attitude-hold is
therefore meaningful away from exactly-vertical flight; the vertical-rise phase
flies open-loop (it needs no feedback), and Phase 4's descent commands are small
tilts about vertical-DOWN retrograde attitudes handled at that phase.

### 4.6b Attitude-hold guidance (`guidance.ts`)

`attitudeHold(cfg, profile)` wraps an `AttitudeController` as a `GuidanceMode`:
`profile(t)` returns the commanded `{θ, ψ, throttle?}` (throttle default 1).
The controller's dt is inferred from successive guidance calls (the run driver
calls guidance exactly once per fixed step; dt = 0 on the first call). The
returned δp/δy are already actuator-shaped (clamp + slew), so the run driver's
own `GimbalActuator` reproduces them exactly — per-step changes never exceed
the shared slew limit, hence the limits bind once, not twice.

### Linearized closed-loop model (README §10.2.3)

Pitch-plane small-signal plant about zero aero (validation isolates the loop
with a zero-coefficient aero table):

```
Iyy·θ̈ = M_y = l_arm·T·sin(δp)·cos(δy) ≈ (T·l_arm)·δp
θ̈ = K·δp,   K = T·l_arm/Iyy      (l_arm = x_gimbal − x_cg, INSTANTANEOUS)
```

With the PD part of the law the closed loop is the classic 2nd-order system

```
θ̈ + K·Kd·θ̇ + K·Kp·θ = K·Kp·θ_cmd    →   ωn = √(K·Kp),  ζ = K·Kd/(2·ωn)
```

(the small Ki adds a slow, low-residue third pole; the plant is a double
integrator, so the steady-state step error is zero even for Ki = 0).

### Validation (README §10.2.3, plan trap T2)

`rocket-pid-step.test.ts` steps the commanded pitch by 2° and compares the full
6-DOF response against the linearized prediction integrated with the same RK4
step and zero-order hold, where `K(t) = T·l_arm/Iyy` is rebuilt every step from
`massProps` at the sim's own instantaneous mass. Run at **both full (8 800 kg)
and near-empty (500 kg) propellant loads**: the plant gain differs ~2.5×
between the loads (K ≈ 20 s⁻² full vs ≈ 52 s⁻² near-empty), so a sim that
caches the moment arm or inertia at full-load values fails the near-empty
trajectory comparison outright — this is exactly plan trap T2. The full-load
case additionally checks the analytic damped-2nd-order character (overshoot and
peak time vs ωn, ζ built from the instantaneous Iyy and l_arm), and the
near-empty case must respond visibly faster. `pid.test.ts` unit-covers
anti-windup clamping, derivative-on-measurement (no kick on an error step),
actuator clamp + slew limiting through the controller, error-angle wrapping,
and both channels' feedback signs.

## Phase 4 — Rocket powered descent (`rocket-sim/guidance/landing`)

Adds the suicide-burn landing guidance (README §4.6 mode 3) and the descent
scenario runner. All parameters live in the config (`control.descent`,
`control.landing_target`, `propulsion.throttle`, `propulsion.gimbal`) —
nothing is hardcoded (README §4.6).

### 4.6c Engine model (plan A7)

The landing engine is a constant rating scaled by throttle:
`T = rated_thrust_n · throttle`, with the throttle clamped to the config band
`[min, max]` while lit and 0 while coasting (engine off — the run driver's
`deriv` already cuts thrust and ṁ at throttle 0). `runLandingSim` swaps the
config's time-based ascent thrust curve for a flat curve at the rating, so the
6-DOF EOM, propulsion Isp(h) blend (ṁ = T/(g₀·Isp)), and mass-property
bookkeeping are exactly the Phase-2 code paths. The reference descent config
(rated 50 kN, band 0.4–1.0) straddles hover thrust across the landing mass
range (dry 2 200 kg ⇒ hover ≈ 0.43·rated; ignition mass 3 000 kg ⇒ ≈ 0.59),
so the vertical loop can command both deceleration and re-acceleration.

### 4.6d Suicide-burn trigger and commanded profile

Ignite (latched — a landing burn does not stutter) when

```
h ≤ v²/(2·a_max) · (1 + margin),   a_max = T_max/m − g   (instantaneous)
```

and freeze the design deceleration at ignition, `a_d = a_max(t_ign)/(1+margin)`.
The commanded climb-rate profile is then the fixed constant-deceleration curve

```
v_cmd(h) = −√(v_td² + 2·a_d·h)
```

which (i) passes through the ignition point by construction — the trigger
fires exactly when the free-fall state meets the `a_d` profile — and
(ii) reaches the commanded touchdown speed `v_td` exactly at h = 0.
Differentiating along the trajectory, `v̇_cmd = a_d·(ḣ/v_cmd) = a_d` when
tracking, so the profile demands a constant deceleration `a_d` all the way to
touchdown (classic suicide burn). Because `a_d` is frozen but the vehicle
lightens as propellant burns, the true `a_max` grows through the burn and the
throttle margin only improves — the margin factor is conservative (the
outside-capture test in `rocket-landing.test.ts` documents this: cases outside
the *trigger's* design region can still land on best-effort max throttle until
depletion runs out of headroom).

**Capture region** (validated in §10.2.4): `h₀ > v₀²·(1+margin)/(2·a_max(m₀))`.
During free fall h decreases while the required ignition altitude grows with
v², so the two cross exactly once and ignition always fires with the designed
margin; below the line the vehicle starts already past its ignition point.

### 4.6e Vertical channel — throttle

```
throttle = m·(g + a_d·clamp(ḣ/v_cmd, 0, 1.5))/T_rated  +  PID(v_cmd − ḣ)
```

clamped to the config band. The first term is feedforward: hover thrust plus
the on-profile deceleration (`ḣ/v_cmd = 1` when tracking; the clamp bounds it
for far-off-profile states). The PID (gains `pid_vz`, derivative unused in the
reference tuning) trims the residual, with the integral contribution anti-
windup-clamped to full throttle authority. Feedforward does the physics,
feedback does the errors — measured tracking is within ≈ 0.05 m/s of the
profile at touchdown across the sweep.

### 4.6f Horizontal channel — position → tilt → gimbal (README §4.6 cascade)

Per NED axis (North shown; East identical):

```
tilt_N = Kp·(N_target − N) + Ki·∫(N_target − N) dt + Kd·(−Ṅ)     [pid_pos]
(tilt_N, tilt_E) bounded jointly to |tilt| ≤ tan(max_tilt)
d̂_NED = normalize(tilt_N, tilt_E, −1)                (desired nose direction)
```

Small tilts of the (roughly hover-thrust) vector give horizontal acceleration
`a_h ≈ (T/m)·tilt ≈ g·tilt`, so the position loop is the classic double
integrator: reference gains kp = 0.004, kd = 0.03 place it at
ωₙ ≈ √(g·kp) ≈ 0.2 rad/s, ζ ≈ 0.9 — an order of magnitude below the attitude
loop's ≈ 2.7 rad/s, preserving cascade separation.

**Attitude at the Euler singularity.** The burn is flown nose-up (θ ≈ 90°)
where the Phase-3 Euler errors are singular, so `AttitudeController` gains a
direction-vector variant used by the landing guidance:

```
b  = R(q)·d̂_NED                 (commanded nose direction in body axes)
eP = atan2(−b_z, b_x)            (rotation about +Y_body carrying x̂ toward b)
eY = atan2(+b_y, b_x)            (rotation about +Z_body)
```

feeding the same per-channel PIDs (rate feedback −q, −r) and the same shared
gimbal actuator. At small angles from a horizontal reference this reduces
exactly to the Euler errors (unit-tested), and the Phase-3 sign closure
carries over unchanged: eP > 0 → +δp → nose-up moment, eY > 0 → +δy →
nose-right moment — negative feedback in both channels with the §4.4-verbatim
moment arm. During coast the gimbal command is 0: with the engine off TVC has
zero control authority anyway (M_thrust ∝ T).

### 4.7a Landing metrics (README §4.7 "landing accuracy")

`runLandingSim` starts from a nose-up descending state (plan A8: the MVP
scenario is the landing burn; boostback is Phase-7 stretch), runs the standard
driver to its ground-impact event (h ≤ 0 = touchdown detection), and reports
in `summary.landing`: touchdown descent rate v_z and lateral speed (final-state
velocity rotated to NED), miss distance to `landing_target` (flat-Earth NED
metres, A14), total non-gravitational load factor at the touchdown state, the
ignition time, and propellant used. The terminal frame is always recorded in
the telemetry regardless of the sampling stride.

### Modeling limitations (documented deviations)

- **Reversed-flow aerodynamics.** A tail-first descent flies at α ≈ 180°; the
  shipped Barrowman table covers the ascent domain (AoA 0–10°) and edge-clamps
  outside it, which would apply ascent-sign axial force to reversed flow.
  Descent validation therefore uses a zero-coefficient table (the Phase-3
  §10.2.3 isolation precedent): §10.2.4 gates guidance + propulsion + gravity
  + mass properties, not descent aerodynamics. A descent-domain table (α to
  180°, grid-fin drag) is Phase-7 material. The guidance law itself is closed
  loop and aero-agnostic — bounded disturbances are absorbed by the throttle
  and tilt trims.
- **Rigid engine-off/on.** Ignition is instantaneous (no spool-up) and latched;
  no re-light or shutdown logic before touchdown. With the reference band the
  minimum throttle exceeds free fall, so the profile never demands thrust
  reversal.

### Validation (README §10.2.4, plan traps T2/T4)

`tests/validation/rocket-landing.test.ts` sweeps initial (altitude, descent
rate) across the capture region — 1.5–3 km, 50–150 m/s, plus lateral-offset
and lateral-velocity cases — on the reference masses/geometry: every case must
touch down below the configured 2 m/s with bounded miss distance (measured:
v_z ≈ 0.95–0.99 m/s vs the 1.0 m/s command; miss ≤ 1.7 m; lateral ≤ 0.4 m/s;
touchdown load ≈ 1.5 g; ≤ 473 kg of the 800 kg landing propellant), with the
throttle inside its band and the gimbal inside its limits at every recorded
frame. The landing burn is also the fastest-changing regime for the gimbal
moment arm and inertia (trap T2) — a stale-arm sim fails the touchdown gate.
An outside-capture case (800 m at 150 m/s) must impact hard, pinning the
boundary. `tests/golden-runs/rocket-landing.test.ts` regression-compares the
reference landing (2 km, 120 m/s, 60 m offset, 8 m/s crosswind drift) loaded
end-to-end from the reference YAML — ignition t = 1.74 s, touchdown 27.49 s at
0.996 m/s vertical / 0.24 m/s lateral, 1.10 m miss, 392 kg propellant — and
asserts bit-identical determinism across runs. Unit coverage:
`attitude-direction.test.ts` (direction-error math at the vertical
singularity, Euler-equivalence away from it, rate feedback),
`landing-guidance.test.ts` (coast/ignition/latch state machine, throttle band,
tilt sign closure, profile-error response), `rocket-loader.test.ts` (descent
block parsing, defaults, landing-target mapping).

---

## Phase 5 — Reentry module (`reentry-sim`)

3-DOF point-mass entry over a rotating spherical Earth in flight-path
coordinates (README §5.1), with Sutton–Graves stagnation heating (§5.2),
load-factor tracking (§5.3), and the entry-corridor bisection search (§5.4).
State: `x = [V, γ, ψ, h, φ, λ]` — Earth-relative speed, flight-path angle
(negative = descending), heading, altitude, latitude, longitude.

**Heading datum (plan A4).** ψ = 0 due North, positive toward East. This is
the convention the README's own kinematic equations imply
(`φ̇ ∝ cos ψ`, `λ̇ ∝ sin ψ`), and everything else follows it.

### 5.1 Full rotating-Earth equations of motion (`deriv.ts`, plan A3)

README §5.1 leaves a literal `[Coriolis/centrifugal cross terms]` placeholder
in the γ̇ equation; plan A3 resolves it with the complete Vinh/Vallado
formulation for velocity relative to the rotating atmosphere. With
`r = Re + h`, `g = g0·(Re/r)²`, Earth rate `Ω`, bank angle `σ`, and
shorthand `s/c` for sin/cos:

```
V̇  = −D/m − g·sγ + Ω²r·cφ·(sγ·cφ − cγ·sφ·cψ)

γ̇  = [ L·cσ/m − (g − V²/r)·cγ + 2ΩV·cφ·sψ
       + Ω²r·cφ·(cγ·cφ + sγ·sφ·cψ) ] / V

ψ̇  = [ L·sσ/m + (V²/r)·cγ²·sψ·tanφ + 2ΩV·(sφ·cγ − sγ·cφ·cψ)
       + Ω²r·sφ·cφ·sψ ] / (V·cγ)

ḣ  = V·sγ          φ̇ = V·cγ·cψ / r          λ̇ = V·cγ·sψ / (r·cφ)
```

Term-by-term: `−D/m` and `L·(cσ|sσ)/m` are the aero forces along/normal to
the velocity; `−g·sγ` / `−g·cγ` the gravity components; `(V²/r)·cγ` the
spherical-Earth curvature relief (weight apparently reduced as V approaches
circular speed); `(V²/r)·cγ²·sψ·tanφ` the meridian-convergence turn of a
great-circle track; the `2ΩV·…` terms Coriolis; the `Ω²r·…` terms the
centrifugal acceleration of the rotating frame resolved into the flight-path
axes.

**Documented deviation — README ψ̇ line.** The README's written-out ψ̇
equation carries `−2Ω_e·V·(sinφ − cosφ·cosψ·tanγ)` and a single `cosγ` on the
convergence term. With the A4 heading datum both disagree with the standard
formulation (above): the Coriolis sign fails the physical check that in the
northern hemisphere a horizontal track deflects RIGHT — at the North Pole,
γ = 0 gives ψ̇|Coriolis = +2Ω (heading increases toward East = rightward),
whereas the README's sign gives −2Ω. The README's own V̇ and γ̇ lines match
the complete formulation verbatim, so this is read as a transcription slip,
not intent; the standard Vinh terms ship. (The README ψ̇ line also omits the
small `Ω²r·sφ·cφ·sψ` centrifugal term entirely.)

**Singularity guards.** ψ̇ is left 0 at |cos γ| < 1e-9 (heading undefined in
purely vertical flight) and the `tanφ` / `λ̇` terms are zeroed at the poles
(plan A17 — guard; out of scope for realistic entries).

### 5.2 Forces, heating, loads (`deriv.ts`, `heating.ts`, `outputs.ts`)

Fixed-trim capsule (README §5.1): constant hypersonic `Cd` and `L/D`, so

```
q̄ = ½·ρ(h)·V²      D = q̄·S_ref·Cd      L = D·(L/D)
q̇ₛ = k_Q·√(ρ/R_n)·V³         k_Q = 1.7415×10⁻⁴  (SI; README §5.2)
Q_total = ∫ q̇ₛ dt              (trapezoid over the accepted adaptive steps)
n = √(D² + L²) / (m·g0)        (README §5.3)
```

ρ(h) is the shared US76 + exponential-extension model — evaluated inside the
integrator at every substep (README §3.2). Downrange is the great-circle
surface distance from the entry point (haversine on the spherical Earth).

### 5.3 Run driver (`sim.ts`)

Adaptive Dormand–Prince RK45 with the same error norm and controller
constants as `physics-core`'s `integrateAdaptive` (README §3.4: reentry uses
adaptive stepping, floor `dt_min = 1e-3 s` near peak heating; ceiling 10 s),
but recording every accepted step so histories and peaks come from exactly
the accepted states. Bank is zero-order-held across each attempted step.
Termination events:

- **landed** — h ≤ 0; the surface crossing is bisection-refined on the step
  fraction before recording the terminal frame.
- **skipped** — post-perigee climb back above the entry-interface altitude
  (plan A4). The detector arms once the vehicle has descended ≥ 1 m below the
  interface. The margin is deliberately tiny: very shallow entries dip only a
  few hundred metres before full-up lift turns them around, and those are
  textbook skips — a coarse arming margin (e.g. 1 km) misclassifies them,
  they then decay over repeated orbital passes to timeout, and classifier
  monotonicity breaks (plan trap T3). The README's secondary "V still
  super-orbital" check is logged, not enforced: `peaks.speedAtTerminationMps`.
- **limit-exceeded** — optional early stop (`terminateOnLimits`) once a §8.2
  limit is exceeded; off by default. Peaks are recorded either way and
  `peaks.limitsExceeded` compares peaks to limits, so classification does not
  depend on this option.
- **timeout** — `maxTime` cap (default 5000 s); should not occur inside the
  corridor search domain (see the arming-margin note above).

### 5.4 Corridor search (`corridor.ts`)

```
classify(run) = 'skipped'          if the run terminated by skip-out
                'limits-exceeded'  else if peak q̇ₛ or peak n exceeded §8.2
                'landed'           otherwise
```

- **Overshoot boundary** = shallowest γ_entry that does not skip: bisection on
  the predicate `classify = 'skipped'`, which must hold at the shallow bracket
  end and fail at the steep end.
- **Undershoot boundary** = steepest γ_entry inside the limits: bisection on
  `peaks.limitsExceeded`, false at the shallow end, true at the steep end.
  (A shallow end that skips is a valid "false": skips are gentle.)
- γ tolerance 1e-4 rad, max 80 iterations, and a bracket-validity precheck
  that rejects brackets whose ends do not straddle the boundary (plan T3).
- **Trap T3 tolerance pinning:** the run's RK45 tolerance (default 1e-8) must
  be ≥ 10× tighter than the γ bisection tolerance or the boundary "converges"
  to integrator noise — enforced with a thrown error, not a convention.
- `findEntryCorridor` sweeps V_entry and returns both boundary curves — the
  data behind the README §5.4 signature corridor chart.

Probed landscape (generic capsule, due-East equatorial entry, bank 0, full
lift-up): at V_entry = 7800 m/s the capsule skips through γ ≈ −2.1°, lands
from γ ≈ −2.5°, and crosses the 1 MW/m² heat-flux limit (which binds before
the 8 g load limit) near γ ≈ −3.7°. At 7200 m/s nothing skips at any angle —
sub-circular energy cannot climb back out — so the corridor's overshoot edge
only exists near/above circular speed, and the corridor tests run at
7800 m/s.

### Validation (README §10.3)

- **§10.3.3 Sutton–Graves spot check** (`tests/unit/sutton-graves.test.ts`):
  ρ = 1e-4, V = 7000, R_n = 1 → q̇ₛ = 1.7415e-4·√(1e-4)·7000³ =
  5.973345×10⁵ W/m² (README quotes ≈ 5.97×10⁵), plus √ρ, 1/√R_n, V³ scaling
  and the trapezoid accumulator on an exactly-integrable ramp.
- **§10.3.1 ballistic entry vs Allen–Eggers**
  (`tests/validation/ballistic-entry.test.ts`): L = 0, γ_E = −40°,
  V_E = 7500 m/s. For a straight-line steep ballistic entry in an exponential
  atmosphere, V(ρ) = V_E·exp(−ρH/(2β_bc·sin|γ|)); maximizing ρV²
  (deceleration) and ρV⁶ (Sutton–Graves q̇ₛ ∝ √ρ·V³) gives the
  scale-height-independent checkpoints V|peak-g = V_E·e^(−1/2) ≈ 0.6065·V_E
  and V|peak-q̇ = V_E·e^(−1/6) ≈ 0.8465·V_E, heating peaking first. Measured:
  0.5971·V_E and 0.8556·V_E (within 1.5%; gates ±0.03 absolute on the ratio
  for US76-vs-exponential and neglected-gravity error), peaks 2.2 s apart at
  t ≈ 18–20 s — near-simultaneous per the README.
- **§10.3.2 bisection bracket-independence**
  (`tests/validation/corridor-bisection.test.ts`): three different overshoot
  brackets and three undershoot brackets each converge to the same boundary
  within 2.5×10⁻⁴ rad; invalid brackets and too-loose integrator tolerances
  throw; a 22-point classifier sweep across −0.3°…−5° is monotone
  skipped → landed → limits-exceeded and visits all three regimes; a 3-point
  `findEntryCorridor` sweep over 7700–7900 m/s keeps the corridor open
  (width > 0.5°) with the undershoot edge steeper everywhere.
- **Golden run** (`tests/golden-runs/reentry-reference.test.ts`): the generic
  capsule loaded end-to-end from YAML, γ_E = −3°, V_E = 7800 m/s East at the
  equator: peak q̇ₛ = 0.80 MW/m² at t = 191 s, peak 2.96 g at t = 492 s,
  Q_total = 202 MJ/m², downrange 3269 km, touchdown at t = 834 s and 63 m/s
  (terminal velocity — no parachute is modeled). Tolerance-compared against
  `reentry-reference.json` (regenerate with `REGEN_GOLDEN=1`) plus a
  bit-for-bit determinism check (README §1).

### Ambiguity resolutions (plan A3, A4, A17)

- **A3** γ̇ `[cross terms]` placeholder → complete Vinh/Vallado formulation
  (§5.1 above), including the ψ̇ corrections documented as a deviation.
- **A4** skip-out = post-perigee climb back above the entry interface
  (1 m arming margin); the super-orbital velocity check is logged in
  `peaks.speedAtTerminationMps`, not enforced. ψ = 0 North, + toward East.
- **A17** `λ̇` (and the ψ̇ `tanφ` term) pole singularity: guarded to 0;
  realistic entries stay away from the poles.

---

## Phase 6 — UI integration (`apps/web`)

No new physics. This phase wires the validated packages into a Vite + React
front-end; everything below is presentation architecture and the conventions
the views must respect. One additive change was made to a package type:
`RunSummary` gained `maxAxialGTime` / `maxLateralGTime` (rocket-sim) so the
§9 "max-g" chart marker has a time coordinate — golden-run summaries compare
per-field, so existing references are unaffected.

### Architecture

- **Same source, zero divergence (README §7):** the app aliases
  `@fds/*` straight to each package's TypeScript source (mirroring the root
  `vitest.config.ts`), so the browser executes exactly the code the 276-test
  suite validates. Reference vehicles are the repo `data/` files inlined as
  raw text (`?raw`) and parsed by the same package loaders.
- **Workers (README §7):** batch runs execute off the UI thread —
  `ascent.worker.ts` (open-loop ascent / Phase-4 landing burn) and
  `corridor.worker.ts` (single reentry + corridor sweep). Corridor points
  stream back one at a time (two bisections ≈ 20 RK45 runs per point), so the
  band shades in live. Message types live in `src/lib/simWorker.ts`, shared by
  both sides.
- **Real-time loop (README §7, §6.4):** `useFixedTimestepLoop` is the classic
  rAF accumulator — physics ticks at fixed `dt = 1/60 s` independent of
  display refresh (wall-clock deltas clamped at 0.25 s across tab switches).
  Module C steps `AircraftSim` in this loop; strip charts sample at 20 Hz and
  re-render at ~10 Hz while the attitude indicator updates every frame.
- **Units at the boundary (README §3.5):** packages and workers speak SI +
  radians only; `src/lib/unitsDisplay.ts` converts for display (km, deg,
  MW/m², kPa) and no component hand-rolls a factor.

### Display conventions (README §9)

- **3D scene frame:** NED → three.js y-up right-handed via
  `(x, y, z) = (East, Up, −North)` (so x̂×ŷ = ẑ with ŷ = −D̂); the path is
  uniformly scaled to ~8 scene units.
- **Attitude indicator signs:** nose-up (+θ) shifts the horizon *down* in the
  view; right bank (+φ) rotates the horizon card by `−φ` in SVG (screen-CW
  positive) — standard inside-out instrument behaviour.
- **Control sign closure (Module C):** pull stick → `δe < 0` → nose-up
  (`Cm_δe < 0`); stick right → `δa > 0` → right-wing-down (`Cl_δa > 0`);
  right pedal → `δr < 0` → nose-right (`Cn_δr < 0`). Surface limits are the
  §6.4 typicals (±25° / ±20° / ±25°).
- **Corridor chart:** γ_entry (deg) vs V_entry with the valid band shaded
  between the boundary curves; the marker drags with live inside/outside
  feedback from band interpolation, and pointer-release flies that entry in
  the worker. Sweep defaults (range 7700–7900 m/s, overshoot bracket
  −0.5°…−3.5°, undershoot −3°…−6°, peaks-only sampling) come from the probed
  landscape in `tests/validation/corridor-bisection.test.ts`.
- **Charts:** one y-scale per chart (never dual-axis); status colors are
  reserved for limits/verdicts (heat-flux & g limit lines, touchdown / skip
  verdict chips) and never used as series colors. The §8.1 booster's
  open-loop ascent defaults to an 11 s cap — the Phase-2 physics finding
  (static margin goes negative as propellant drains aft) means it genuinely
  tumbles past ~12 s, which the panel states rather than hides.

### Verification

- `apps/web/tests/smoke.test.tsx` (Vitest + jsdom): the shell mounts, tabs
  switch, and each module view mounts running the real loaders and the real
  `eig4x4 → modalAnalysis` pipeline at mount (jsdom lacks WebGL, so only the
  r3f scene is stubbed). Run with `npm run test:web`.
- `npm run build:web` = `tsc --noEmit` for the app + `vite build`.
- Root `npm test` (276) and `npm run typecheck` stay green.

---

## Phase 7 — Stretch: cross-module extras

Four independent items (README §11, plan Phase 7 outline): the J2 gravity
toggle, the convex powered-descent guidance + boostback scenario, radiative
heating, and the nonlinear 6-DOF aircraft model. All are opt-in — every
default-off path is regression-locked bit-for-bit by the existing golden runs
(318 tests total after this phase).

### J2 oblateness gravity (`physics-core/gravity.ts`, README §3.3 toggle)

From the degree-2 zonal geopotential `U = μ/r − μ·J2·Re²·(3sin²φ − 1)/(2r³)`:

```
a_J2 (Cartesian, z = spin axis) = −(3/2)·J2·μ·Re²/r⁵ · [ x(1 − 5z²/r²),
                                                          y(1 − 5z²/r²),
                                                          z(3 − 5z²/r²) ]
g_down  = μ/r²·[1 − (3/2)·J2·(Re/r)²·(3sin²φ − 1)]
g_north = −3·μ·J2·Re²·sinφ·cosφ / r⁴        (toward the equator)
```

with `J2 = 1.08262668e-3` and — deliberately — `μ ≡ g0·Re²` (≈ 0.15 % from
WGS-84, consistent with the suite's mean-radius Re) so that the J2-off path
reproduces §3.3's `g(h) = g0·(Re/(Re+h))²` exactly. `gravityNED(h, lat, j2)`
returns the local (down, north) pair; `tests/unit/gravity-j2.test.ts` pins the
Cartesian form against the numeric potential gradient and the NED form against
the projected Cartesian form, so the two cannot drift apart.

**Reentry consumer:** `derivReentry(…, j2)` (threaded from
`ReentryRunOptions.j2`, default false). Projecting NED gravity `[g_N, 0, g]`
onto the flight-path triad adds

```
V̇ += g_N·cosγ·cosψ        γ̇·V += −g_N·sinγ·cosψ        ψ̇·V·cosγ += −g_N·sinψ
```

next to the existing −g·sinγ / −g·cosγ terms (which keep their form with the
J2-corrected g). Module A stays flat-Earth NED (plan A14): a ≤ few-km rocket
flight sees a J2 signal orders below the controller's authority.

### Convex powered-descent guidance (`rocket-sim/guidance/{socp,pdg,boostback}.ts`)

Plan lists one file (`pdg.ts`); split three ways for the same reason
Phase 3/4 split control from guidance — solver, planner, and scenario are
separately testable. **`socp.ts`** is a self-contained dense conic solver
(README §7: no external numerics): ADMM over `min cᵀx s.t. Ax + s = b, s ∈ K`
with the equality rows enforced exactly through a KKT system (partial-pivot
LU, factored once), block-equilibrated cone rows, over-relaxation α = 1.6,
and free residual-balancing ρ adaptation (the KKT factor is ρ-independent).
Guidance-grade default tolerance 1e-4 on equilibrated data — the KKT
regularization floors the dual residual near 1e-5 while terminal errors sit
at micrometres; `tests/unit/socp.test.ts` uses 1e-9 on small analytic
problems.

**`pdg.ts`** poses the Açıkmeşe–Ploen lossless-convexification min-fuel
problem (JGCD 30(5), 2007) on the ZOH double integrator in NED:

```
min Σ σ_k·Δt   s.t.   r/v propagation with a = g + u,   ‖u_k‖ ≤ σ_k,
u_min,k ≤ σ_k ≤ u_max,k,   r_N = target, v_N = (0,0,v_td),
optional glide-slope SOC  ‖r_xy,k − target‖ ≤ tan(γ_gs)·h_k
```

nondimensionalized (time/tf, accel/g0, length/g0·tf²). Deviations from full
GFOLD, all deliberate: per-node mass ESTIMATE refined by successive
approximation (2 passes) instead of the z = ln m change of variables; g
constant; no drag (Phase-4 zero-table precedent); sea-level Isp. The
relaxation is verified tight a-posteriori (`maxRelaxationGapMps2`, observed
≤ 1e-4 m/s²). `solvePdgAuto` sweeps tf over a heuristic grid and returns the
min-fuel *flyable* solve (`pdgIsFlyable` gates status + terminal residuals +
bounds + gap). Validation (`tests/validation/rocket-pdg.test.ts`): the 1-D
constant-mass vertical problem reproduces the analytic min→max bang-bang cost
within 1 %.

**Tracking** (`poweredDescentPdgGuidance`): `f_des = u_ref + kp(r_ref − r) +
kd(v_ref − v)` (defaults 0.08 / 0.6 → ω_n ≈ 0.28 rad/s, an octave under the
Phase-4 position loop, decades under attitude); throttle `m‖f‖/T_rated`
clamped to the A7 band; direction through the Phase-4 non-singular
`updateDirection` cascade. **Past tf the feedforward switches to hover-descent
(u = −g)** — holding the final braking node's u (thrust-to-weight ≈ 1.5)
makes the vehicle hover above the pad until dry, the one genuine trap found
in closed-loop testing. PDG burns continuously from activation (σ ≥ u_min >
0), so it cannot beat the Phase-4 coast-then-burn on fuel — measured 408 vs
376 kg on the (2000 m, 100 m/s) case, with touchdown 0.98–1.00 m/s (commanded
1.0), miss ≤ 0.14 m, and plan-vs-flown propellant within 1 kg.

**`boostback.ts`** (plan A8 stretch): boostback → flip → coast → landing
state machine. The burn holds the thrust axis horizontal along the
velocity-to-be-gained `v_go = (target − r_xy)/t_eff − v_xy` with

```
t_go: r_z + v_z t + g t²/2 = 0        (vacuum-ballistic time to ground)
t_eff = t_go + v_impact/(2·a_d)       (suicide-burn flight-time extension)
```

— the extension term prices in the horizontal drift during the landing burn;
without it the naive impact-point aim overshoots by ~880 m, with it the
measured miss is ≈ 45 m from a 1.2 km divert (soft, 1.19 m/s), inside the
lateral channel's proven envelope. Cutoff on ‖v_go‖ < 2 m/s (monotone under
thrust along it, unlike an impact-error minimum, which fires early as t_go
shrinks). The flip runs at MIN throttle — the gimbal needs thrust for
authority — and hands to the untouched Phase-4 law, whose own trigger
provides the fuel-optimal coast (which is exactly why the terminal phase is
not the continuous-burn PDG).

### Radiative heating (`reentry-sim/radiative.ts`, README §5.2 optional term)

Tauber–Sutton Earth correlation (J. Spacecraft & Rockets 28(1), 1991):

```
q̇_r [W/cm²] = 4.736×10⁴ · R_n^a · ρ^1.22 · f(V),
a = min(1, 1.072×10⁶ · V^−1.88 · ρ^−0.325)
```

f(V) tabulated 9–16 km/s, linear interpolation, **zero below 9 km/s** (NASA
course precedent: a 3.5 km/s case evaluates q̇_r = 0 — radiative heating is a
super-orbital phenomenon, which is why the README calls it optional for
LEO-return) and clamped above 16 km/s. The tabulated correlation already
embeds the Goulard/Tauber–Wakefield radiative-cooling effect, so no coupling
factor is layered on. **Provenance caveat:** C, b, the a(V, ρ) formula, units,
and validity band were verified against secondary literature (NASA TFAWS
aerothermo course; Dec & Braun AIAA TPS sizing; Springer SMO 2021), but the
original JSR table itself is paywalled — the shipped `F_V_EARTH` values are
the widely-reproduced ones and carry that trust level. Toggle:
`ReentryRunOptions.radiative` (default false). New additive outputs:
`ReentryFrame.qdotR`, peaks `qdotRMax` / `qRadTotalJm2` / `qdotTotalMax`;
`qdotSMax`/`qTotalJm2` stay convective-only, and the §8.2 heat-flux limit
(hence `limitsExceeded`, `terminateOnLimits`, and the corridor's undershoot
boundary) now tests `qdotTotalMax` — bit-identical with the toggle off.
Heating stays diagnostic (not a force), so trajectories are unchanged either
way.

### Nonlinear 6-DOF aircraft (`aircraft-sim/nonlinear6dof.ts`, Module C upgrade)

Rigid-body EOM in the exact `rocket-sim/deriv.ts` structure (state
`[r_NED, v_body, q, ω]`, 13 wide; diagonal inertia — §8.3 has no Ixz):

```
m(v̇ + ω×v) = F_aero + T·x̂ + R(q)·[0,0,m g0]      I ω̇ + ω×(Iω) = M_aero
```

Aero coefficients are rebuilt from the SAME §8.3 derivative set, evaluated
about the §6.1 trim (α-plane force decomposition; rate terms on the
instantaneous `c̄/2V`, `b/2V`; û = (V−U0)/U0 recovers the speed derivatives
through q̄ ∝ V² automatically). The coefficients stay locally linear — that is
all a derivative set can support — while the dynamics carry the real
nonlinearity: quaternion attitude, gyroscopic coupling, ω×v, gravity through
the full DCM, ρ(h). `Cm_α̇` uses the standard two-pass α̇ evaluation
(accelerations without the α̇ moment → α̇ = (u ẇ − w u̇)/(u²+w²) → pitch-moment
correction), which reproduces README §6.2's M_α̇ folding exactly at trim.
Thrust `T = max(0, T0 + m·X_δt·δt)` with `T0 = q̄0 S CD0 + m g0 sinθ0`.

**Trim caveat:** `trimState` is an exact equilibrium only when CL0 equals the
A2 level-flight value `m g0 cosθ0/(q̄0 S)` (what the loader computes when the
YAML omits CL0). The Navion's published CL0 = 0.41 vs 0.406 implied leaves a
~0.1 m/s² residual that self-excites the phugoid — the validation therefore
compares Jacobians and doublets on a level-CL0 clone, keeping A and the
nonlinear model apples-to-apples.

**Validation** (`tests/validation/aircraft-nonlinear.test.ts`): the central-
difference Jacobian in the §6.2/§6.3 coordinates matches `eig(A_lon)` to
6e-11 and `eig(A_lat)` to 3e-8 relative — the model linearizes exactly to
Phase 1, pinning every sign at once. A 0.002 rad elevator doublet tracks the
linear sim to 0.06 % of peak response; scaling the doublet 100× grows the
normalized deviation ~89× (gate 10×) — genuinely nonlinear, not the linear
model in disguise. `NonlinearAircraftSim` mirrors `AircraftSim`'s step API
(same control tuples, 1/60 s default, per-step quaternion renormalization) as
the README's "upgrade path".
