import { describe, it, expect } from 'vitest';
import { G0 } from '@fds/physics-core';
import { buildLonStateSpace, buildLatStateSpace } from '@fds/aircraft-sim';
import type { AircraftConfig } from '@fds/aircraft-sim';

// Same round-number config as dimensionalize.test.ts; q̄0 passed explicitly.
const baseConfig = (theta0Rad = 0): AircraftConfig => ({
  name: 'unit-test',
  geometry: { wingAreaM2: 20, chordM: 2, spanM: 10 },
  mass: { massKg: 1000, IyyKgm2: 2000, IxxKgm2: 1500, IzzKgm2: 3000 },
  trim: { U0Mps: 50, theta0Rad, altitudeM: 0 },
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
const U0 = 50;

describe('buildLonStateSpace (README §6.2, state [Δu, α, q, θ])', () => {
  const { A, B } = buildLonStateSpace(baseConfig(), QBAR);

  it('row 1 (Δu̇) = [Xu, Xα, 0, −g·cosθ0]', () => {
    expect(A[0][0]).toBeCloseTo(-0.032, 9);
    expect(A[0][1]).toBeCloseTo(2.0, 9);
    expect(A[0][2]).toBeCloseTo(0, 9);
    expect(A[0][3]).toBeCloseTo(-G0, 9); // cosθ0 = 1
  });

  it('row 2 (α̇) = [Zu/U0, Zα/U0, 1+Zq/U0, −g·sinθ0/U0]', () => {
    expect(A[1][0]).toBeCloseTo(-0.4 / U0, 9);
    expect(A[1][1]).toBeCloseTo(-100.8 / U0, 9);
    expect(A[1][2]).toBeCloseTo(1, 9); // Zq = 0
    expect(A[1][3]).toBeCloseTo(0, 9); // sinθ0 = 0
  });

  it('row 3 (q̇) folds in the M_α̇ coupling', () => {
    // Mu + Mα̇·Zu/U0
    expect(A[2][0]).toBeCloseTo(0 + -1.6 * (-0.4 / U0), 9);
    // Mα + Mα̇·Zα/U0 = −16 + (−1.6)(−2.016)
    expect(A[2][1]).toBeCloseTo(-16 + -1.6 * (-100.8 / U0), 9);
    // Mq + Mα̇·(1+Zq/U0) = −4 + (−1.6)(1)
    expect(A[2][2]).toBeCloseTo(-4 + -1.6 * 1, 9);
    expect(A[2][3]).toBeCloseTo(0, 9);
  });

  it('row 4 (θ̇) = [0, 0, 1, 0]', () => {
    expect(A[3]).toEqual([0, 0, 1, 0]);
  });

  it('B_lon: elevator + throttle columns with M_α̇ coupling in row 3', () => {
    expect(B[0][0]).toBeCloseTo(0, 9); // Xδe
    expect(B[0][1]).toBeCloseTo(2, 9); // Xδt
    expect(B[1][0]).toBeCloseTo(-6 / U0, 9); // Zδe/U0
    expect(B[1][1]).toBeCloseTo(0, 9);
    // Mδe + Mα̇·Zδe/U0 = −24 + (−1.6)(−6/50)
    expect(B[2][0]).toBeCloseTo(-24 + -1.6 * (-6 / U0), 9);
    expect(B[2][1]).toBeCloseTo(0, 9);
    expect(B[3]).toEqual([0, 0]);
  });

  it('places the gravity terms with θ0 ≠ 0 (cosθ0 in row 1, sinθ0/U0 in row 2)', () => {
    const th = 0.1;
    const { A: A2 } = buildLonStateSpace(baseConfig(th), QBAR);
    expect(A2[0][3]).toBeCloseTo(-G0 * Math.cos(th), 9);
    expect(A2[1][3]).toBeCloseTo(-G0 * Math.sin(th) / U0, 9);
  });
});

describe('buildLatStateSpace (README §6.3, state [β, p, r, φ])', () => {
  const { A, B } = buildLatStateSpace(baseConfig(), QBAR);

  it('row 1 (β̇) = [Yβ/U0, Yp/U0, Yr/U0−1, g·cosθ0/U0]', () => {
    expect(A[0][0]).toBeCloseTo(-12 / U0, 9);
    expect(A[0][1]).toBeCloseTo(0, 9);
    expect(A[0][2]).toBeCloseTo(-1, 9); // Yr/U0 − 1, Yr = 0
    expect(A[0][3]).toBeCloseTo(G0 / U0, 9); // cosθ0 = 1
  });

  it('row 2 (ṗ) = [Lβ, Lp, Lr, 0] (pure aero, Ixz neglected)', () => {
    expect(A[1][0]).toBeCloseTo(-13.333333333, 6);
    expect(A[1][1]).toBeCloseTo(-5.333333333, 6);
    expect(A[1][2]).toBeCloseTo(1.333333333, 6);
    expect(A[1][3]).toBeCloseTo(0, 9);
  });

  it('row 3 (ṙ) = [Nβ, Np, Nr, 0]', () => {
    expect(A[2][0]).toBeCloseTo(5.333333333, 6);
    expect(A[2][1]).toBeCloseTo(-0.333333333, 6);
    expect(A[2][2]).toBeCloseTo(-1.0, 6);
    expect(A[2][3]).toBeCloseTo(0, 9);
  });

  it('row 4 (φ̇) = [0, 1, tanθ0, 0]', () => {
    expect(A[3][0]).toBeCloseTo(0, 9);
    expect(A[3][1]).toBeCloseTo(1, 9);
    expect(A[3][2]).toBeCloseTo(0, 9); // tan(0)
    expect(A[3][3]).toBeCloseTo(0, 9);
  });

  it('B_lat: aileron + rudder columns, side-force row scaled by 1/U0', () => {
    expect(B[0][0]).toBeCloseTo(0, 9); // Yδa/U0
    expect(B[0][1]).toBeCloseTo(2 / U0, 9); // Yδr/U0
    expect(B[1][0]).toBeCloseTo(20, 6); // Lδa
    expect(B[1][1]).toBeCloseTo(0, 9); // Lδr
    expect(B[2][0]).toBeCloseTo(0, 9); // Nδa
    expect(B[2][1]).toBeCloseTo(-4.666666667, 6); // Nδr
    expect(B[3]).toEqual([0, 0]);
  });

  it('places g·cosθ0/U0 in row 1 and tanθ0 in row 4 with θ0 ≠ 0', () => {
    const th = 0.1;
    const { A: A2 } = buildLatStateSpace(baseConfig(th), QBAR);
    expect(A2[0][3]).toBeCloseTo(G0 * Math.cos(th) / U0, 9);
    expect(A2[3][2]).toBeCloseTo(Math.tan(th), 9);
  });
});
