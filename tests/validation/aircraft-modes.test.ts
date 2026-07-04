/**
 * README §10.4 — the eigenvalues of the Navion's A_lon/A_lat, built from its
 * published non-dimensional derivative set, must reproduce the Navion's
 * documented short-period / phugoid / dutch-roll / roll / spiral characteristics
 * (Nelson, "Flight Stability and Automatic Control"), and the §6.2/§6.3
 * closed-form approximations must agree with the eigenvalues to ~10–20%.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  loadAircraftYaml,
  buildLonStateSpace,
  buildLatStateSpace,
  modalAnalysis,
  approxShortPeriod,
  approxPhugoid,
  approxDutchRoll,
  approxRollTau,
  approxSpiralTau,
} from '@fds/aircraft-sim';
import type { ModeReport, ModeKind } from '@fds/aircraft-sim';

const navionYaml = readFileSync(
  fileURLToPath(new URL('../../data/aircraft-derivatives/navion.aircraft.yaml', import.meta.url)),
  'utf8',
);
const cfg = loadAircraftYaml(navionYaml);
const lonModes = modalAnalysis(buildLonStateSpace(cfg).A);
const latModes = modalAnalysis(buildLatStateSpace(cfg).A);
const find = (modes: ModeReport[], name: ModeKind): ModeReport => {
  const m = modes.find((x) => x.name === name);
  if (!m) throw new Error(`missing ${name} in [${modes.map((x) => x.name)}]`);
  return m;
};

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('Navion longitudinal modes (README §10.4)', () => {
  const sp = find(lonModes, 'short-period');
  const ph = find(lonModes, 'phugoid');

  it('short-period reproduces the published fast, well-damped mode (ωn≈3.6, ζ≈0.69)', () => {
    expect(sp.oscillatory).toBe(true);
    expect(sp.wn).toBeGreaterThan(2.9);
    expect(sp.wn).toBeLessThan(4.3);
    expect(sp.zeta).toBeGreaterThan(0.57);
    expect(sp.zeta).toBeLessThan(0.81);
  });

  it('phugoid reproduces the published slow, lightly-damped mode (ωn≈0.21, ζ≈0.08)', () => {
    expect(ph.oscillatory).toBe(true);
    expect(ph.wn).toBeGreaterThan(0.17);
    expect(ph.wn).toBeLessThan(0.26);
    expect(ph.zeta).toBeGreaterThan(0.02);
    expect(ph.zeta).toBeLessThan(0.14);
  });

  it('short-period and phugoid are strongly timescale-separated (ωn ratio > 10)', () => {
    expect(sp.wn / ph.wn).toBeGreaterThan(10);
  });

  it('closed-form approximations agree with the eigenvalues', () => {
    const spA = approxShortPeriod(cfg);
    const phA = approxPhugoid(cfg);
    expect(rel(spA.wn, sp.wn)).toBeLessThan(0.1); // short-period ωn within 10%
    expect(rel(spA.zeta, sp.zeta)).toBeLessThan(0.15);
    expect(rel(phA.wn, ph.wn)).toBeLessThan(0.25); // Lanchester ωn runs ~20% high
    expect(rel(phA.zeta, ph.zeta)).toBeLessThan(0.3);
  });
});

describe('Navion lateral-directional modes (README §10.4)', () => {
  const dr = find(latModes, 'dutch-roll');
  const roll = find(latModes, 'roll');
  const spiral = find(latModes, 'spiral');

  it('dutch-roll reproduces the published lightly-damped oscillation (ωn≈2.4, ζ≈0.2)', () => {
    expect(dr.oscillatory).toBe(true);
    expect(dr.wn).toBeGreaterThan(2.0);
    expect(dr.wn).toBeLessThan(3.0);
    expect(dr.zeta).toBeGreaterThan(0.1);
    expect(dr.zeta).toBeLessThan(0.3);
  });

  it('roll subsidence is a fast, stable real root (λ≈−8.4, τ≈0.12 s)', () => {
    expect(roll.oscillatory).toBe(false);
    expect(roll.eigenvalue.re).toBeLessThan(-4);
    const tau = -1 / roll.eigenvalue.re;
    expect(tau).toBeGreaterThan(0.08);
    expect(tau).toBeLessThan(0.25);
  });

  it('spiral is a slow, near-neutral (slightly stable) real root', () => {
    expect(spiral.oscillatory).toBe(false);
    expect(Math.abs(spiral.eigenvalue.re)).toBeLessThan(0.05);
    expect(spiral.eigenvalue.re).toBeLessThan(0.01); // stable or very nearly so
  });

  it('closed-form approximations agree with the eigenvalues', () => {
    const drA = approxDutchRoll(cfg);
    expect(rel(drA.wn, dr.wn)).toBeLessThan(0.2);
    expect(rel(drA.zeta, dr.zeta)).toBeLessThan(0.3);

    const rollTauEig = -1 / roll.eigenvalue.re;
    expect(rel(approxRollTau(cfg), rollTauEig)).toBeLessThan(0.15);

    // Spiral magnitude approximation is famously poor; require only that it
    // agrees on stability (both convergent).
    const spiralStableByApprox = approxSpiralTau(cfg) > 0;
    const spiralStableByEig = spiral.eigenvalue.re < 0;
    expect(spiralStableByApprox).toBe(spiralStableByEig);
  });
});

describe('shipped derivative data files are well-formed', () => {
  it('generic-light-single loads and builds a well-posed model', () => {
    const g = loadAircraftYaml(
      readFileSync(
        fileURLToPath(
          new URL('../../data/aircraft-derivatives/generic-light-single.aircraft.yaml', import.meta.url),
        ),
        'utf8',
      ),
    );
    expect(g.lon.CL0).toBeGreaterThan(0); // computed from level-flight trim
    const lm = modalAnalysis(buildLonStateSpace(g).A);
    const km = modalAnalysis(buildLatStateSpace(g).A);
    for (const m of [...lm, ...km]) {
      expect(Number.isFinite(m.wn)).toBe(true);
      expect(m.wn).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m.zeta)).toBe(true);
    }
    expect(lm.length).toBeGreaterThanOrEqual(2);
    expect(km.length).toBeGreaterThanOrEqual(2);
  });
});
