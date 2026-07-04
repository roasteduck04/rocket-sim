/**
 * 3-DOF rotating-spherical-Earth equations of motion (README §5.1, plan A3).
 *
 * Complete Vinh/Vallado flight-path formulation for Earth-relative velocity,
 * with heading ψ measured from North positive toward East (plan A4). README
 * §5.1 leaves a literal "[Coriolis/centrifugal cross terms]" placeholder in
 * the γ̇ equation; the terms implemented here are the full set — the README's
 * written-out V̇ and γ̇ terms match them verbatim. The §5.1 ψ̇ line is
 * incomplete for this heading datum and is replaced by the standard
 * formulation (sign fixed by the northern-hemisphere right-deflection check);
 * full derivation and the deviation note live in docs/equations.md Phase 5.
 *
 *   V̇ = −D/m − g·sinγ + Ω²r·cosφ·(sinγ·cosφ − cosγ·sinφ·cosψ)
 *   γ̇ = [L·cosσ/m − (g − V²/r)·cosγ + 2ΩV·cosφ·sinψ
 *        + Ω²r·cosφ·(cosγ·cosφ + sinγ·sinφ·cosψ)] / V
 *   ψ̇ = [L·sinσ/m + (V²/r)·cos²γ·sinψ·tanφ + 2ΩV·(sinφ·cosγ − sinγ·cosφ·cosψ)
 *        + Ω²r·sinφ·cosφ·sinψ] / (V·cosγ)
 *   ḣ = V·sinγ
 *   φ̇ = V·cosγ·cosψ / r
 *   λ̇ = V·cosγ·sinψ / (r·cosφ)          (pole-guarded, plan A17)
 */

import { OMEGA_EARTH, RE, gravityNED } from '@fds/physics-core';
import { atmosphere } from '@fds/atmosphere-models';
import type { ReentryConfig, ReentryState } from './types.js';
import { unpackReentryState } from './types.js';

/** Aero quantities shared by the EOM and the aux outputs (README §5.1). */
export interface ReentryForces {
  /** Air density at h, kg/m³. */
  rho: number;
  /** Speed of sound at h, m/s. */
  a: number;
  /** Dynamic pressure ½ρV², Pa. */
  qbar: number;
  /** Drag force, N. */
  D: number;
  /** Lift force, N. */
  L: number;
  mach: number;
}

/** Drag/lift on the fixed-trim capsule: constant Cd and L/D (README §5.1). */
export const reentryForces = (s: ReentryState, cfg: ReentryConfig): ReentryForces => {
  const atmo = atmosphere(Math.max(s.h, 0));
  const qbar = 0.5 * atmo.rho * s.V * s.V;
  const D = qbar * cfg.refAreaM2 * cfg.cd;
  const L = D * cfg.clOverCd;
  return { rho: atmo.rho, a: atmo.a, qbar, D, L, mach: s.V / atmo.a };
};

/** Angle guard: below this cosine magnitude the singular rate is zeroed. */
const COS_GUARD = 1e-9;

/**
 * State derivative for the flat 6-element vector under bank angle `bankRad`.
 * Pure function of (t, x) — deterministic, no caching (README §1).
 *
 * With `j2 = true` (README §3.3 toggle, Phase 7) gravity gains the oblateness
 * correction: the radial term g picks up the J2 factor and a tangential
 * (north) component g_N appears. Projecting the NED gravity vector
 * [g_N, 0, g] onto the flight-path triad (v̂, ∂v̂/∂γ, horizontal-normal) adds
 *
 *   V̇        += g_N·cosγ·cosψ
 *   γ̇·V      += −g_N·sinγ·cosψ
 *   ψ̇·V·cosγ += −g_N·sinψ
 *
 * alongside the existing −g·sinγ / −g·cosγ terms (which keep their form with
 * the J2-corrected g). g_N = 0 with the toggle off, restoring Phase 5 exactly.
 */
export const derivReentry = (
  _t: number,
  x: Float64Array,
  cfg: ReentryConfig,
  bankRad: number,
  j2 = false,
): Float64Array => {
  const s = unpackReentryState(x);
  const { D, L } = reentryForces(s, cfg);
  const m = cfg.massKg;

  const r = RE + s.h;
  const { down: g, north: gN } = gravityNED(s.h, s.lat, j2);
  const W = OMEGA_EARTH;

  const sg = Math.sin(s.gamma);
  const cg = Math.cos(s.gamma);
  const sp = Math.sin(s.psi);
  const cp = Math.cos(s.psi);
  const sf = Math.sin(s.lat);
  const cf = Math.cos(s.lat);
  const cs = Math.cos(bankRad);
  const ss = Math.sin(bankRad);

  const W2r = W * W * r;

  const Vdot = -D / m - g * sg + gN * cg * cp + W2r * cf * (sg * cf - cg * sf * cp);

  const gammadot =
    ((L * cs) / m -
      (g - (s.V * s.V) / r) * cg -
      gN * sg * cp +
      2 * W * s.V * cf * sp +
      W2r * cf * (cg * cf + sg * sf * cp)) /
    s.V;

  // ψ̇ is singular at γ = ±90° (heading undefined in purely vertical flight);
  // hold heading there. The tanφ convergence term and λ̇ are singular at the
  // poles (plan A17); both are zeroed there.
  const tanLat = Math.abs(cf) < COS_GUARD ? 0 : sf / cf;
  const psidot =
    Math.abs(cg) < COS_GUARD
      ? 0
      : ((L * ss) / m -
          gN * sp +
          ((s.V * s.V) / r) * cg * cg * sp * tanLat +
          2 * W * s.V * (sf * cg - sg * cf * cp) +
          W2r * sf * cf * sp) /
        (s.V * cg);

  const hdot = s.V * sg;
  const latdot = (s.V * cg * cp) / r;
  const londot = Math.abs(cf) < COS_GUARD ? 0 : (s.V * cg * sp) / (r * cf);

  return Float64Array.of(Vdot, gammadot, psidot, hdot, latdot, londot);
};
