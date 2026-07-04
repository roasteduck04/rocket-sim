/**
 * README §10.4 — identical positive/negative aileron doublets must produce
 * mirror-image roll responses, and the aileron must act primarily on the roll
 * channel (bank φ, roll rate p) rather than sideslip/yaw. This catches sign and
 * mis-placement bugs in B_lat.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadAircraftYaml, AircraftSim, doubletInput } from '@fds/aircraft-sim';

const navionYaml = readFileSync(
  fileURLToPath(new URL('../../data/aircraft-derivatives/navion.aircraft.yaml', import.meta.url)),
  'utf8',
);
const cfg = loadAircraftYaml(navionYaml);

const dt = 1 / 60;
const N = Math.round(20 / dt);

// Run a pure aileron doublet (rudder = 0) of the given amplitude, capturing the
// full lateral state history [β, p, r, φ].
const runAileron = (amp: number) => {
  const sim = new AircraftSim(cfg);
  const aileron = doubletInput(0.5, 0.5, amp);
  const beta: number[] = [];
  const p: number[] = [];
  const r: number[] = [];
  const phi: number[] = [];
  for (let i = 0; i < N; i++) {
    const ti = sim.state.t;
    sim.step([0, 0], [aileron(ti), 0]);
    const [b, pp, rr, ph] = sim.state.lat;
    beta.push(b);
    p.push(pp);
    r.push(rr);
    phi.push(ph);
  }
  return { beta, p, r, phi };
};

const plus = runAileron(0.1);
const minus = runAileron(-0.1);
const maxAbs = (a: number[]): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('Aileron symmetry (README §10.4)', () => {
  it('±aileron doublets give exact mirror-image roll-rate and bank responses', () => {
    let maxP = 0;
    let maxPhi = 0;
    for (let i = 0; i < N; i++) {
      maxP = Math.max(maxP, Math.abs(plus.p[i] + minus.p[i]));
      maxPhi = Math.max(maxPhi, Math.abs(plus.phi[i] + minus.phi[i]));
    }
    expect(maxP).toBeLessThan(1e-9);
    expect(maxPhi).toBeLessThan(1e-9);
  });

  it('the aileron is an effective roll control (bank and roll rate build up)', () => {
    expect(maxAbs(plus.phi)).toBeGreaterThan(0.03);
    expect(maxAbs(plus.p)).toBeGreaterThan(0.03);
  });

  it('the response is roll-dominant (φ ≫ β, and roll rate ≫ yaw rate)', () => {
    // A B_lat that routed the aileron into the wrong row would fail these.
    expect(maxAbs(plus.phi)).toBeGreaterThan(3 * maxAbs(plus.beta));
    expect(maxAbs(plus.p)).toBeGreaterThan(maxAbs(plus.r));
  });

  it('+ and − ailerons roll the aircraft in opposite directions', () => {
    // At the instant of peak roll rate, the two runs have opposite-sign rates.
    let iPeak = 0;
    let peak = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(plus.p[i]) > peak) {
        peak = Math.abs(plus.p[i]);
        iPeak = i;
      }
    }
    expect(Math.sign(plus.p[iPeak])).toBe(-Math.sign(minus.p[iPeak]));
    expect(plus.p[iPeak]).not.toBe(0);
  });
});
