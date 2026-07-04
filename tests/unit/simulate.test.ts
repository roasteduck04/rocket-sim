import { describe, it, expect } from 'vitest';
import { AircraftSim, doubletInput } from '@fds/aircraft-sim';
import type { AircraftConfig } from '@fds/aircraft-sim';

// Navion (stable) config, built directly so the sim test is self-contained.
const navion = (): AircraftConfig => ({
  name: 'Navion',
  geometry: { wingAreaM2: 17.09, chordM: 1.737, spanM: 10.18 },
  mass: { massKg: 1247, IyyKgm2: 4068, IxxKgm2: 1421, IzzKgm2: 4786 },
  trim: { U0Mps: 53.64, theta0Rad: 0, altitudeM: 0 },
  lon: {
    CL0: 0.41, CD0: 0.05, CL_alpha: 4.44, CD_alpha: 0.33, Cm_alpha: -0.683,
    Cm_q: -9.96, Cm_alpha_dot: -4.36, Cm_delta_e: -1.122, CL_delta_e: 0.355,
    CL_u: 0, CD_u: 0, Cm_u: 0, CL_q: 0, X_delta_t: 0,
  },
  lat: {
    CY_beta: -0.564, Cl_beta: -0.074, Cn_beta: 0.071, Cl_p: -0.410, Cn_r: -0.125,
    Cl_delta_a: -0.134, Cn_delta_r: -0.074, CY_p: 0, CY_r: 0, Cl_r: 0.107,
    Cn_p: -0.0575, Cl_delta_r: 0, Cn_delta_a: 0, CY_delta_a: 0, CY_delta_r: 0.157,
  },
});

const norm = (v: readonly number[]): number => Math.hypot(...v);

describe('doubletInput', () => {
  const d = doubletInput(1.0, 0.5, 0.1); // start 1 s, half-width 0.5 s, ±0.1

  it('is zero before the pulse', () => {
    expect(d(0)).toBe(0);
    expect(d(0.999)).toBe(0);
  });
  it('is +amplitude on the first half', () => {
    expect(d(1.0)).toBe(0.1);
    expect(d(1.4)).toBe(0.1);
  });
  it('is −amplitude on the second half', () => {
    expect(d(1.5)).toBe(-0.1);
    expect(d(1.9)).toBe(-0.1);
  });
  it('is zero after the pulse', () => {
    expect(d(2.0)).toBe(0);
    expect(d(5)).toBe(0);
  });
});

describe('AircraftSim', () => {
  it('holds trim: zero state + zero controls stays at zero', () => {
    const sim = new AircraftSim(navion());
    for (let i = 0; i < 120; i++) sim.step([0, 0], [0, 0]);
    expect(norm(sim.state.lon)).toBeLessThan(1e-12);
    expect(norm(sim.state.lat)).toBeLessThan(1e-12);
  });

  it('advances time by dt each step (default 1/60 s)', () => {
    const sim = new AircraftSim(navion());
    sim.step([0, 0], [0, 0]);
    expect(sim.state.t).toBeCloseTo(1 / 60, 12);
    sim.step([0, 0], [0, 0], 0.01);
    expect(sim.state.t).toBeCloseTo(1 / 60 + 0.01, 12);
  });

  it('damps an initial α perturbation (stable short-period)', () => {
    const sim = new AircraftSim(navion());
    sim.reset({ lon: [0, 0.1, 0, 0] }); // 0.1 rad AoA perturbation
    // Response must stay bounded and decay well below the initial perturbation.
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      sim.step([0, 0], [0, 0]); // 10 s at 1/60
      peak = Math.max(peak, Math.abs(sim.state.lon[1]));
    }
    expect(peak).toBeLessThan(0.2); // never diverges
    expect(Math.abs(sim.state.lon[1])).toBeLessThan(0.02); // settles toward trim
  });

  it('keeps longitudinal and lateral channels decoupled', () => {
    const sim = new AircraftSim(navion());
    sim.reset({ lat: [0.1, 0, 0, 0] }); // sideslip only
    for (let i = 0; i < 120; i++) sim.step([0, 0], [0, 0]);
    expect(norm(sim.state.lon)).toBeLessThan(1e-12); // lateral IC never leaks to lon
    expect(norm(sim.state.lat)).toBeGreaterThan(0); // lateral dynamics did evolve
  });

  it('an elevator input drives longitudinal state but not lateral', () => {
    const sim = new AircraftSim(navion());
    for (let i = 0; i < 30; i++) sim.step([-0.05, 0], [0, 0]); // elevator, no aileron/rudder
    expect(norm(sim.state.lon)).toBeGreaterThan(0);
    expect(norm(sim.state.lat)).toBeLessThan(1e-12);
  });

  it('is deterministic — identical runs give bit-identical results', () => {
    const run = (): number[] => {
      const sim = new AircraftSim(navion());
      const dE = doubletInput(0.5, 0.5, 0.05);
      for (let i = 0; i < 300; i++) {
        const t = sim.state.t;
        sim.step([dE(t), 0], [0, 0]);
      }
      return [...sim.state.lon, ...sim.state.lat];
    };
    expect(run()).toEqual(run());
  });
});
