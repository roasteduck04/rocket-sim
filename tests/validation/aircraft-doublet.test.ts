/**
 * README §10.4 — an elevator doublet must excite a fast, well-damped short-period
 * transient (visible in pitch rate q) followed by a slow, lightly-damped phugoid
 * (visible in the speed perturbation Δu), with numerically distinct timescales.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  loadAircraftYaml,
  AircraftSim,
  doubletInput,
  buildLonStateSpace,
  modalAnalysis,
} from '@fds/aircraft-sim';

const navionYaml = readFileSync(
  fileURLToPath(new URL('../../data/aircraft-derivatives/navion.aircraft.yaml', import.meta.url)),
  'utf8',
);
const cfg = loadAircraftYaml(navionYaml);

// Elevator doublet at t = 1 s, ±0.05 rad, 0.5 s half-width; 60 s at 1/60.
const dt = 1 / 60;
const elevator = doubletInput(1.0, 0.5, 0.05);
const sim = new AircraftSim(cfg);
const t: number[] = [];
const q: number[] = []; // pitch rate, lon[2]
const du: number[] = []; // speed perturbation, lon[0]
for (let i = 0; i < 60 / dt; i++) {
  const ti = sim.state.t;
  sim.step([elevator(ti), 0], [0, 0]);
  t.push(sim.state.t);
  q.push(sim.state.lon[2]);
  du.push(sim.state.lon[0]);
}

const at = (time: number): number => Math.round(time / dt) - 1;
const maxAbs = (a: number[], i0 = 0, i1 = a.length): number => {
  let m = 0;
  for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(a[i]));
  return m;
};
// Zero-crossing times of a signal within a sample window.
const crossings = (a: number[], i0: number, i1: number): number[] => {
  const times: number[] = [];
  for (let i = i0 + 1; i < i1; i++) {
    if ((a[i - 1] <= 0 && a[i] > 0) || (a[i - 1] >= 0 && a[i] < 0)) times.push(t[i]);
  }
  return times;
};

describe('Elevator doublet response (README §10.4)', () => {
  it('short-period is fast: pitch rate peaks early and damps out within a few seconds', () => {
    const qPeak = maxAbs(q);
    let tPeak = 0;
    for (let i = 0; i < q.length; i++) {
      if (Math.abs(q[i]) === qPeak) {
        tPeak = t[i];
        break;
      }
    }
    expect(qPeak).toBeGreaterThan(0.005); // the doublet actually excited pitch
    expect(tPeak).toBeLessThan(3); // fast onset (short-period)
    expect(Math.abs(q[at(6)])).toBeLessThan(0.15 * qPeak); // damped by 6 s
  });

  it('phugoid is slow and lightly damped: Δu oscillates with a long period', () => {
    // After ~6 s the short-period has decayed, leaving the phugoid in Δu.
    const i0 = at(6);
    const i1 = at(56);
    const zc = crossings(du, i0, i1);
    expect(zc.length).toBeGreaterThanOrEqual(2); // it oscillates

    // Estimate the period from the window and crossing count (2 crossings/period).
    const periodEst = (2 * (t[i1] - t[i0])) / zc.length;
    expect(periodEst).toBeGreaterThan(15);
    expect(periodEst).toBeLessThan(50);

    // Lightly damped → still a meaningful fraction of its post-transient amplitude at 30 s.
    const phugoidAmp = maxAbs(du, i0, i1);
    expect(Math.abs(du[at(30)])).toBeGreaterThan(0.15 * phugoidAmp);
  });

  it('the two modes are timescale-separated (phugoid period ≫ short-period period)', () => {
    const modes = modalAnalysis(buildLonStateSpace(cfg).A);
    const spPeriod = modes.find((m) => m.name === 'short-period')!.period;
    const i0 = at(6);
    const i1 = at(56);
    const zc = crossings(du, i0, i1);
    const phugoidPeriod = (2 * (t[i1] - t[i0])) / zc.length;
    expect(phugoidPeriod).toBeGreaterThan(5 * spPeriod);
  });
});
