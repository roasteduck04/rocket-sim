import { describe, it, expect } from 'vitest';
import {
  modalAnalysis,
  approxShortPeriod,
  approxPhugoid,
  approxDutchRoll,
  approxRollTau,
  approxSpiralTau,
} from '@fds/aircraft-sim';
import type { AircraftConfig, ModeReport, ModeKind } from '@fds/aircraft-sim';

const LN2 = Math.log(2);
const find = (modes: ModeReport[], name: ModeKind): ModeReport => {
  const m = modes.find((x) => x.name === name);
  if (!m) throw new Error(`no ${name} mode in [${modes.map((x) => x.name)}]`);
  return m;
};

describe('modalAnalysis — eigenvalue → mode extraction', () => {
  // Two oscillatory pairs → longitudinal. Block-diagonal so eigenvalues are exact:
  //   short-period −2 ± 3i (ωn = √13), phugoid −0.05 ± 0.3i (ωn ≈ 0.304).
  const lon = [
    [-2, 3, 0, 0],
    [-3, -2, 0, 0],
    [0, 0, -0.05, 0.3],
    [0, 0, -0.3, -0.05],
  ];

  it('classifies the two oscillatory pairs by frequency (SP fast, phugoid slow)', () => {
    const modes = modalAnalysis(lon);
    expect(modes.map((m) => m.name).sort()).toEqual(['phugoid', 'short-period']);
    const sp = find(modes, 'short-period');
    const ph = find(modes, 'phugoid');
    expect(sp.wn).toBeGreaterThan(ph.wn);
  });

  it('computes ωn, ζ, period, and time-to-half for the short-period pair', () => {
    const sp = find(modalAnalysis(lon), 'short-period');
    expect(sp.oscillatory).toBe(true);
    expect(sp.wn).toBeCloseTo(Math.sqrt(13), 4); // 3.6056
    expect(sp.zeta).toBeCloseTo(2 / Math.sqrt(13), 4); // 0.5547
    expect(sp.period).toBeCloseTo((2 * Math.PI) / 3, 4); // 2π/ωd
    expect(sp.isDoubling).toBe(false);
    expect(sp.tHalfOrDouble).toBeCloseTo(LN2 / 2, 4); // ln2/|σ|
  });

  it('computes phugoid characteristics (lightly damped, long period)', () => {
    const ph = find(modalAnalysis(lon), 'phugoid');
    expect(ph.wn).toBeCloseTo(Math.hypot(0.05, 0.3), 4); // 0.3041
    expect(ph.zeta).toBeCloseTo(0.05 / Math.hypot(0.05, 0.3), 4);
    expect(ph.period).toBeCloseTo((2 * Math.PI) / 0.3, 3);
  });

  // One oscillatory pair + two real roots → lateral.
  //   dutch roll −0.4 ± 2.3i, roll −8 (fast), spiral −0.02 (slow).
  const lat = [
    [-0.4, 2.3, 0, 0],
    [-2.3, -0.4, 0, 0],
    [0, 0, -8, 0],
    [0, 0, 0, -0.02],
  ];

  it('classifies pair as dutch-roll, fast real as roll, slow real as spiral', () => {
    const modes = modalAnalysis(lat);
    expect(modes.map((m) => m.name).sort()).toEqual([
      'dutch-roll',
      'roll',
      'spiral',
    ]);
    const roll = find(modes, 'roll');
    const spiral = find(modes, 'spiral');
    expect(roll.oscillatory).toBe(false);
    expect(roll.wn).toBeCloseTo(8, 4);
    expect(roll.tHalfOrDouble).toBeCloseTo(LN2 / 8, 4);
    expect(spiral.wn).toBeCloseTo(0.02, 4);
    expect(find(modes, 'dutch-roll').oscillatory).toBe(true);
  });

  it('reports time-to-DOUBLE for an unstable (positive-real) root', () => {
    // Stable dutch roll pair + fast stable roll + UNSTABLE spiral (+0.03).
    const unstable = [
      [-0.4, 2.3, 0, 0],
      [-2.3, -0.4, 0, 0],
      [0, 0, -8, 0],
      [0, 0, 0, 0.03],
    ];
    const spiral = find(modalAnalysis(unstable), 'spiral');
    expect(spiral.zeta).toBeLessThan(0); // unstable → negative damping
    expect(spiral.isDoubling).toBe(true);
    expect(spiral.tHalfOrDouble).toBeCloseTo(LN2 / 0.03, 3);
  });
});

// Round-number config (matches statespace.test.ts); q̄0 passed explicitly.
const baseConfig = (): AircraftConfig => ({
  name: 'unit-test',
  geometry: { wingAreaM2: 20, chordM: 2, spanM: 10 },
  mass: { massKg: 1000, IyyKgm2: 2000, IxxKgm2: 1500, IzzKgm2: 3000 },
  trim: { U0Mps: 50, theta0Rad: 0, altitudeM: 0 },
  lon: {
    CL0: 0.5, CD0: 0.04, CL_alpha: 5, CD_alpha: 0.4, Cm_alpha: -0.8,
    Cm_q: -10, Cm_alpha_dot: -4, Cm_delta_e: -1.2, CL_delta_e: 0.3,
    CL_u: 0, CD_u: 0, Cm_u: 0, CL_q: 0, X_delta_t: 2,
  },
  lat: {
    CY_beta: -0.6, Cl_beta: -0.1, Cn_beta: 0.08, Cl_p: -0.4, Cn_r: -0.15,
    Cl_delta_a: 0.15, Cn_delta_r: -0.07, CY_p: 0, CY_r: 0, Cl_r: 0.1,
    Cn_p: -0.05, Cl_delta_r: 0, Cn_delta_a: 0, CY_delta_a: 0, CY_delta_r: 0.1,
  },
});
const QBAR = 1000;

describe('closed-form mode approximations (README §6.2/§6.3)', () => {
  it('short-period ωn = √(Mq·Zα/U0 − Mα), ζ = −(Mq + Zα/U0 + Mα̇)/(2ωn)', () => {
    const { wn, zeta } = approxShortPeriod(baseConfig(), QBAR);
    expect(wn).toBeCloseTo(Math.sqrt((-4 * -100.8) / 50 - -16), 4); // 4.9055
    expect(zeta).toBeCloseTo(-(-4 + -100.8 / 50 + -1.6) / (2 * 4.9055), 3); // 0.7762
  });

  it('phugoid ωn = g√2/U0, ζ = 1/(√2·(L/D))', () => {
    const { wn, zeta } = approxPhugoid(baseConfig(), QBAR);
    expect(wn).toBeCloseTo((9.80665 * Math.SQRT2) / 50, 4); // 0.27737
    expect(zeta).toBeCloseTo(1 / (Math.SQRT2 * (0.5 / 0.04)), 4); // 0.05656
  });

  it('dutch-roll ωn = √(Nβ + Yβ·Nr/U0), ζ = −(Nr + Yβ/U0)/(2ωn)', () => {
    const { wn, zeta } = approxDutchRoll(baseConfig(), QBAR);
    expect(wn).toBeCloseTo(Math.sqrt(5.333333 + (-12 * -1.0) / 50), 4); // 2.3608
    expect(zeta).toBeCloseTo(-(-1.0 + -12 / 50) / (2 * 2.3608), 3); // 0.2626
  });

  it('roll τ = −1/Lp', () => {
    expect(approxRollTau(baseConfig(), QBAR)).toBeCloseTo(-1 / -5.333333, 4); // 0.1875
  });

  it('spiral τ = −1/λspiral, λspiral = (Lβ·Nr − Lr·Nβ)/Lβ', () => {
    const lambda = (-13.333333 * -1.0 - 1.333333 * 5.333333) / -13.333333;
    expect(approxSpiralTau(baseConfig(), QBAR)).toBeCloseTo(-1 / lambda, 3); // 2.143
  });
});
