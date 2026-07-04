import { describe, it, expect } from 'vitest';
import { loadAircraftYaml } from '@fds/aircraft-sim';

// Minimal valid YAML with ONLY the §8.3 required fields (optionals omitted so we
// can assert the A2 defaulting behaviour).
const minimalYaml = `
name: "Test Plane"
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
`;

describe('loadAircraftYaml', () => {
  it('parses geometry, mass, and the required derivative fields', () => {
    const cfg = loadAircraftYaml(minimalYaml);
    expect(cfg.name).toBe('Test Plane');
    expect(cfg.geometry).toEqual({ wingAreaM2: 16.2, chordM: 1.49, spanM: 10.9 });
    expect(cfg.mass.massKg).toBe(1100);
    expect(cfg.mass.IyyKgm2).toBe(1350);
    expect(cfg.lon.CL_alpha).toBe(4.4);
    expect(cfg.lon.Cm_delta_e).toBe(-1.28);
    expect(cfg.lat.CY_beta).toBe(-0.393);
    expect(cfg.lat.Cn_delta_r).toBe(-0.0645);
  });

  it('converts trim θ0 from degrees to radians', () => {
    const cfg = loadAircraftYaml(minimalYaml.replace('theta0_deg: 0', 'theta0_deg: 6'));
    expect(cfg.trim.theta0Rad).toBeCloseTo((6 * Math.PI) / 180, 10);
  });

  it('defaults the A2 optional derivatives to 0', () => {
    const cfg = loadAircraftYaml(minimalYaml);
    expect(cfg.lon.CD0).toBe(0);
    expect(cfg.lon.CL_delta_e).toBe(0);
    expect(cfg.lon.CL_u).toBe(0);
    expect(cfg.lon.Cm_u).toBe(0);
    expect(cfg.lon.CL_q).toBe(0);
    expect(cfg.lon.X_delta_t).toBe(0);
    expect(cfg.lat.CY_p).toBe(0);
    expect(cfg.lat.Cl_r).toBe(0);
    expect(cfg.lat.Cn_p).toBe(0);
    expect(cfg.lat.CY_delta_r).toBe(0);
  });

  it('computes CL0 = m·g/(q̄0·S) from the level-flight trim when omitted', () => {
    const cfg = loadAircraftYaml(minimalYaml);
    // m=1100, S=16.2, U0=60, alt=1000 m → ρ≈1.112 kg/m³, q̄0≈2002 Pa.
    // CL0 = 1100·9.80665 / (2002·16.2) ≈ 0.333.
    expect(cfg.lon.CL0).toBeGreaterThan(0.30);
    expect(cfg.lon.CL0).toBeLessThan(0.36);
  });

  it('respects an explicit CL0 when provided', () => {
    const cfg = loadAircraftYaml(
      minimalYaml.replace('  CL_alpha: 4.4', '  CL0: 0.31\n  CL_alpha: 4.4'),
    );
    expect(cfg.lon.CL0).toBe(0.31);
  });

  it('reads optional derivatives when present', () => {
    const cfg = loadAircraftYaml(
      minimalYaml.replace('  Cn_delta_r: -0.0645', '  Cn_delta_r: -0.0645\n  Cl_r: 0.12'),
    );
    expect(cfg.lat.Cl_r).toBe(0.12);
  });

  it('throws a descriptive error when a required field is missing', () => {
    const bad = minimalYaml.replace('  Cm_alpha: -0.89\n', '');
    expect(() => loadAircraftYaml(bad)).toThrow(/Cm_alpha/);
  });

  it('throws when a whole section is missing', () => {
    const bad = minimalYaml.replace(/lateral_derivatives_nondim:[\s\S]*$/, '');
    expect(() => loadAircraftYaml(bad)).toThrow(/lateral_derivatives_nondim/);
  });

  it('throws on non-object YAML', () => {
    expect(() => loadAircraftYaml('42')).toThrow();
  });
});
