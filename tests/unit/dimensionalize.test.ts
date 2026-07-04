import { describe, it, expect } from 'vitest';
import {
  dimensionalizeLon,
  dimensionalizeLat,
  trimDynamicPressure,
  airDensityAtTrim,
} from '@fds/aircraft-sim';
import type { AircraftConfig } from '@fds/aircraft-sim';

// Round-number reference config so every dimensional derivative can be checked by
// hand. Geometry/mass chosen for clean arithmetic; q̄0 is passed explicitly to the
// dimensionalizers in most tests to keep them independent of the atmosphere model.
const baseConfig = (): AircraftConfig => ({
  name: 'unit-test',
  geometry: { wingAreaM2: 20, chordM: 2, spanM: 10 },
  mass: { massKg: 1000, IyyKgm2: 2000, IxxKgm2: 1500, IzzKgm2: 3000 },
  trim: { U0Mps: 50, theta0Rad: 0, altitudeM: 0 },
  lon: {
    CL0: 0.5,
    CD0: 0.04,
    CL_alpha: 5,
    CD_alpha: 0.4,
    Cm_alpha: -0.8,
    Cm_q: -10,
    Cm_alpha_dot: -4,
    Cm_delta_e: -1.2,
    CL_delta_e: 0.3,
    CL_u: 0,
    CD_u: 0,
    Cm_u: 0,
    CL_q: 0,
    X_delta_t: 2,
  },
  lat: {
    CY_beta: -0.6,
    Cl_beta: -0.1,
    Cn_beta: 0.08,
    Cl_p: -0.4,
    Cn_r: -0.15,
    Cl_delta_a: 0.15,
    Cn_delta_r: -0.07,
    CY_p: 0,
    CY_r: 0,
    Cl_r: 0.1,
    Cn_p: -0.05,
    Cl_delta_r: 0,
    Cn_delta_a: 0,
    CY_delta_a: 0,
    CY_delta_r: 0.1,
  },
});

// With q̄0 = 1000 Pa and S = 20 m², QS = 20 000 N throughout.
const QBAR = 1000;

describe('dimensionalizeLon (README §6.2 conversions)', () => {
  const d = dimensionalizeLon(baseConfig(), QBAR);

  it('Xu = -(CDu + 2·CD0)·q̄S / (m·U0)', () => {
    expect(d.Xu).toBeCloseTo(-0.032, 10); // -(2·0.04)·20000/(1000·50)
  });
  it('Xα = (CL0 − CDα)·q̄S / m', () => {
    expect(d.Xalpha).toBeCloseTo(2.0, 10); // (0.5−0.4)·20000/1000
  });
  it('Zu = -(CLu + 2·CL0)·q̄S / (m·U0)', () => {
    expect(d.Zu).toBeCloseTo(-0.4, 10);
  });
  it('Zα = -(CLα + CD0)·q̄S / m', () => {
    expect(d.Zalpha).toBeCloseTo(-100.8, 10); // -(5+0.04)·20
  });
  it('Zq = -CLq·q̄S·c̄ / (2·m·U0) = 0 here', () => {
    expect(d.Zq).toBeCloseTo(0, 10);
  });
  it('Mα = Cmα·q̄S·c̄ / Iyy', () => {
    expect(d.Malpha).toBeCloseTo(-16, 10); // -0.8·20000·2/2000
  });
  it('Mα̇ = Cmα̇·q̄S·c̄² / (2·U0·Iyy)', () => {
    expect(d.Malphadot).toBeCloseTo(-1.6, 10); // -4·20000·4/(2·50·2000)
  });
  it('Mq = Cmq·q̄S·c̄² / (2·U0·Iyy)', () => {
    expect(d.Mq).toBeCloseTo(-4.0, 10); // -10·20000·4/200000
  });
  it('Mu = 0 when Cmu = 0', () => {
    expect(d.Mu).toBeCloseTo(0, 10);
  });
  it('Zδe = -CLδe·q̄S / m', () => {
    expect(d.Zde).toBeCloseTo(-6.0, 10); // -0.3·20
  });
  it('Mδe = Cmδe·q̄S·c̄ / Iyy', () => {
    expect(d.Mde).toBeCloseTo(-24, 10); // -1.2·20
  });
  it('Xδt passes through the direct-thrust derivative', () => {
    expect(d.Xdt).toBeCloseTo(2, 10);
  });
});

describe('dimensionalizeLat (README §6.3 conversions)', () => {
  const d = dimensionalizeLat(baseConfig(), QBAR);

  it('Yβ = CYβ·q̄S / m', () => {
    expect(d.Ybeta).toBeCloseTo(-12, 10); // -0.6·20
  });
  it('Lβ = Clβ·q̄S·b / Ixx', () => {
    expect(d.Lbeta).toBeCloseTo(-13.333333333, 6); // -0.1·20000·10/1500
  });
  it('Lp = Clp·q̄S·b² / (2·U0·Ixx)', () => {
    expect(d.Lp).toBeCloseTo(-5.333333333, 6); // -0.4·20000·100/(2·50·1500)
  });
  it('Lr = Clr·q̄S·b² / (2·U0·Ixx)', () => {
    expect(d.Lr).toBeCloseTo(1.333333333, 6);
  });
  it('Nβ = Cnβ·q̄S·b / Izz', () => {
    expect(d.Nbeta).toBeCloseTo(5.333333333, 6); // 0.08·20000·10/3000
  });
  it('Np = Cnp·q̄S·b² / (2·U0·Izz)', () => {
    expect(d.Np).toBeCloseTo(-0.333333333, 6);
  });
  it('Nr = Cnr·q̄S·b² / (2·U0·Izz)', () => {
    expect(d.Nr).toBeCloseTo(-1.0, 6); // -0.15·20000·100/300000
  });
  it('Lδa = Clδa·q̄S·b / Ixx', () => {
    expect(d.Lda).toBeCloseTo(20, 6); // 0.15·20000·10/1500
  });
  it('Nδr = Cnδr·q̄S·b / Izz', () => {
    expect(d.Ndr).toBeCloseTo(-4.666666667, 6);
  });
  it('Yδr = CYδr·q̄S / m', () => {
    expect(d.Ydr).toBeCloseTo(2.0, 6); // 0.1·20
  });
});

describe('trimDynamicPressure', () => {
  it('q̄0 = ½·ρ0·U0² using the US76 sea-level density at altitude 0', () => {
    const cfg = baseConfig(); // altitudeM = 0 → ρ ≈ 1.225 kg/m³
    expect(airDensityAtTrim(cfg)).toBeCloseTo(1.225, 2);
    expect(trimDynamicPressure(cfg)).toBeCloseTo(0.5 * 1.225 * 50 * 50, 0);
  });

  it('dimensionalizeLon defaults q̄0 to the atmosphere-derived value', () => {
    const cfg = baseConfig();
    const qbar = trimDynamicPressure(cfg);
    const withDefault = dimensionalizeLon(cfg);
    const withExplicit = dimensionalizeLon(cfg, qbar);
    expect(withDefault.Malpha).toBeCloseTo(withExplicit.Malpha, 10);
  });
});
