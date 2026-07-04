/**
 * J2 oblateness gravity toggle (README §3.3, Phase 7).
 *
 * Three independent checks pin the implementation:
 *  1. `j2Acceleration` (Cartesian) equals the numerical gradient of the J2
 *     geopotential term — catches any algebra slip in the closed form.
 *  2. `gravityNED` equals central + `j2Acceleration` projected onto the local
 *     (down, north) triad — the two public forms cannot drift apart.
 *  3. Physical signatures: stronger-than-spherical at the equator, weaker at
 *     the poles, tangential pull toward the equator at mid-latitudes, and the
 *     toggle off reproduces §3.3's inverse-square law bit-for-bit.
 */
import { describe, it, expect } from 'vitest';
import {
  G0,
  J2_EARTH,
  MU_EARTH,
  RE,
  gravityAtAltitude,
  gravityNED,
  j2Acceleration,
  type Vec3,
} from '@fds/physics-core';
import { derivReentry, loadReentryYaml, runReentry } from '@fds/reentry-sim';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const capsuleYaml = readFileSync(
  fileURLToPath(new URL('../../data/reentry-vehicles/generic-capsule.reentry.yaml', import.meta.url)),
  'utf8',
);

/** J2 term of the geopotential (per unit mass), for numeric-gradient checks. */
const j2Potential = (r: Vec3): number => {
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  const rn = Math.sqrt(r2);
  const sin2 = (r.z * r.z) / r2;
  return ((-MU_EARTH * J2_EARTH * RE * RE) / (2 * rn * rn * rn)) * (3 * sin2 - 1);
};

describe('j2Acceleration (README §3.3 toggle, Phase 7)', () => {
  it('matches the numerical gradient of the J2 potential term', () => {
    const points: Vec3[] = [
      { x: RE + 100e3, y: 0, z: 0 },
      { x: 4e6, y: 3e6, z: 5e6 },
      { x: -2.5e6, y: 6e6, z: -1.5e6 },
      { x: 0, y: 0, z: RE + 500e3 }, // on the spin axis
    ];
    const eps = 1; // m — potential varies over ~1e6 m scales, so this is tiny
    for (const p of points) {
      const a = j2Acceleration(p);
      for (const axis of ['x', 'y', 'z'] as const) {
        const hi = { ...p, [axis]: p[axis] + eps };
        const lo = { ...p, [axis]: p[axis] - eps };
        const grad = (j2Potential(hi) - j2Potential(lo)) / (2 * eps);
        // a = +∇U with U the potential defined so g = ∇U (attractive central
        // term −μ/r · (−1) convention); compare against the gradient.
        expect(a[axis]).toBeCloseTo(grad, 8);
      }
    }
  });

  it('is purely radial (inward) at the equator and on the spin axis', () => {
    const eq = j2Acceleration({ x: RE, y: 0, z: 0 });
    expect(eq.x).toBeLessThan(0); // extra pull toward Earth at the equator
    expect(Math.abs(eq.y)).toBe(0);
    expect(Math.abs(eq.z)).toBe(0);
    const pole = j2Acceleration({ x: 0, y: 0, z: RE });
    expect(Math.abs(pole.x)).toBe(0);
    expect(Math.abs(pole.y)).toBe(0);
    expect(pole.z).toBeGreaterThan(0); // outward: weaker gravity over the pole
  });
});

describe('gravityNED (README §3.3, Phase 7)', () => {
  it('reproduces §3.3 inverse-square exactly with the toggle off', () => {
    for (const h of [0, 50e3, 400e3]) {
      for (const lat of [0, 0.7, -1.2]) {
        const g = gravityNED(h, lat, false);
        expect(g.down).toBe(gravityAtAltitude(h));
        expect(g.north).toBe(0);
      }
    }
  });

  it('agrees with central + j2Acceleration projected onto the local triad', () => {
    for (const h of [0, 120e3]) {
      for (const lat of [-1.1, -0.3, 0, 0.45, 1.3]) {
        const r = RE + h;
        const pos: Vec3 = { x: r * Math.cos(lat), y: 0, z: r * Math.sin(lat) };
        const aJ2 = j2Acceleration(pos);
        const central = MU_EARTH / (r * r); // toward Earth center
        // Local unit vectors at (lat, lon = 0): down = −r̂, north = ∂r̂/∂lat.
        const down = { x: -Math.cos(lat), y: 0, z: -Math.sin(lat) };
        const north = { x: -Math.sin(lat), y: 0, z: Math.cos(lat) };
        const g = gravityNED(h, lat, true);
        expect(g.down).toBeCloseTo(central + (aJ2.x * down.x + aJ2.z * down.z), 10);
        expect(g.north).toBeCloseTo(aJ2.x * north.x + aJ2.z * north.z, 10);
      }
    }
  });

  it('shows the oblateness signature: equator stronger, pole weaker, pull toward equator', () => {
    const gSphere = gravityAtAltitude(0);
    const eq = gravityNED(0, 0, true);
    const pole = gravityNED(0, Math.PI / 2, true);
    const mid = gravityNED(0, Math.PI / 4, true);
    // Hand values: down(eq) = μ/Re²·(1 + 1.5·J2), down(pole) = μ/Re²·(1 − 3·J2).
    expect(eq.down).toBeCloseTo(gSphere * (1 + 1.5 * J2_EARTH), 9);
    expect(pole.down).toBeCloseTo(gSphere * (1 - 3 * J2_EARTH), 9);
    // North component: −3·(μ/Re²)·J2·sinφ·cosφ = −1.5·g0·J2 at 45°N (southward).
    expect(mid.north).toBeCloseTo(-1.5 * G0 * J2_EARTH, 9);
    expect(gravityNED(0, -Math.PI / 4, true).north).toBeCloseTo(+1.5 * G0 * J2_EARTH, 9);
  });
});

describe('reentry J2 toggle (Phase 7)', () => {
  const cfg = loadReentryYaml(capsuleYaml);

  it('derivReentry with j2 omitted/false is unchanged from Phase 5', () => {
    const x = Float64Array.of(7800, -0.05, Math.PI / 2, 120e3, 0.4, 0.1);
    const dOff = derivReentry(0, x, cfg, 0);
    const dExplicit = derivReentry(0, x, cfg, 0, false);
    for (let i = 0; i < 6; i++) expect(dExplicit[i]).toBe(dOff[i]);
  });

  it('J2 perturbs a mid-latitude entry slightly but does not change the outcome class', () => {
    // Northeast entry at 45°N so both the radial correction and g_north act.
    const opts = { lat0: Math.PI / 4, psi0: Math.PI / 4, tol: 1e-8 } as const;
    const base = runReentry(cfg, -0.06, 7800, { ...opts });
    const withJ2 = runReentry(cfg, -0.06, 7800, { ...opts, j2: true });
    expect(base.peaks.terminationReason).toBe('landed');
    expect(withJ2.peaks.terminationReason).toBe('landed');
    const dDownrange = Math.abs(withJ2.peaks.downrangeM - base.peaks.downrangeM);
    // J2 is a ~1e-3 relative perturbation: visible, but small.
    expect(dDownrange).toBeGreaterThan(0);
    expect(dDownrange / base.peaks.downrangeM).toBeLessThan(0.02);
    expect(withJ2.peaks.nMax / base.peaks.nMax).toBeCloseTo(1, 1);
  });
});
