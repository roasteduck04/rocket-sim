/**
 * ADMM SOCP solver unit tests (Phase 7, `rocket-sim/guidance/socp.ts`).
 * Small problems with known closed-form optima.
 */
import { describe, it, expect } from 'vitest';
import { solveSocp } from '@fds/rocket-sim';

const row = (...v: number[]): Float64Array => Float64Array.from(v);

describe('solveSocp (Phase 7)', () => {
  it('solves a tiny LP: min x1 + x2 s.t. x1 + x2 ≥ 1, x ≥ 0 → optimum 1', () => {
    // s = b − Ax ∈ R₊³:  x1+x2−1 ≥ 0, x1 ≥ 0, x2 ≥ 0.
    const sol = solveSocp({
      c: row(1, 1),
      A: [row(-1, -1), row(-1, 0), row(0, -1)],
      b: row(-1, 0, 0),
      cones: { eq: 0, nonneg: 3, soc: [] },
    }, { tolerance: 1e-9 });
    expect(sol.status).toBe('converged');
    expect(sol.x[0] + sol.x[1]).toBeCloseTo(1, 6);
    expect(sol.x[0]).toBeGreaterThan(-1e-7);
    expect(sol.x[1]).toBeGreaterThan(-1e-7);
  });

  it('solves min ‖u‖ s.t. Σu = 3 → u = (1,1,1), objective √3', () => {
    // Variables [σ, u1, u2, u3]; min σ; eq: u1+u2+u3 = 3; SOC: (σ, u) ∈ SOC(4).
    const sol = solveSocp({
      c: row(1, 0, 0, 0),
      A: [
        row(0, 1, 1, 1), // eq row: Ax = b → s = b − Ax = 0
        row(-1, 0, 0, 0), // SOC rows: s = (σ, u)
        row(0, -1, 0, 0),
        row(0, 0, -1, 0),
        row(0, 0, 0, -1),
      ],
      b: row(3, 0, 0, 0, 0),
      cones: { eq: 1, nonneg: 0, soc: [4] },
    }, { tolerance: 1e-9 });
    expect(sol.status).toBe('converged');
    expect(sol.x[1]).toBeCloseTo(1, 5);
    expect(sol.x[2]).toBeCloseTo(1, 5);
    expect(sol.x[3]).toBeCloseTo(1, 5);
    expect(sol.x[0]).toBeCloseTo(Math.sqrt(3), 5);
  });

  it('handles active SOC + bound interaction: min σ s.t. ‖u‖ ≤ σ, u1 ≥ 2', () => {
    // Variables [σ, u1]; optimum σ = 2 at u1 = 2 (cone tight).
    const sol = solveSocp({
      c: row(1, 0),
      A: [row(0, -1), row(-1, 0), row(0, -1)],
      b: row(-2, 0, 0),
      cones: { eq: 0, nonneg: 1, soc: [2] },
    }, { tolerance: 1e-9 });
    expect(sol.status).toBe('converged');
    expect(sol.x[0]).toBeCloseTo(2, 5);
    expect(sol.x[1]).toBeCloseTo(2, 5);
  });

  it('reports non-convergence on an infeasible problem instead of a bogus answer', () => {
    // x ≥ 1 and −x ≥ 0 cannot both hold.
    const sol = solveSocp(
      {
        c: row(0),
        A: [row(-1), row(1)],
        b: row(-1, 0),
        cones: { eq: 0, nonneg: 2, soc: [] },
      },
      { maxIterations: 2000 },
    );
    expect(sol.status).toBe('max-iterations');
    expect(sol.primalResidual).toBeGreaterThan(1e-6);
  });
});
