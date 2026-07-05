/** Verdict priority ladder (landing-sim spec §7): first match wins. */
import { describe, expect, it } from 'vitest';
import type { LandingSummary, TelemetryFrame } from '@fds/rocket-sim';
import { classifyLanding, tiltFromVertical } from '../src/features/landing-sim/verdict';
import { referenceRocket } from '../src/lib/data';

const cfg = referenceRocket(); // vzMax 2, padR 15, tiltMax 5°, rud 25 (Task 1 yaml)

const summary = (over: Partial<LandingSummary>): LandingSummary => ({
  touchedDown: true,
  ignitionTime: 100,
  touchdownVz: 1.0,
  touchdownLateralSpeed: 0.2,
  missDistance: 3,
  touchdownG: 1.2,
  propellantUsedKg: 900,
  ...over,
});

const frame = (over: Partial<TelemetryFrame>): TelemetryFrame => ({
  t: 120,
  r: { x: 0, y: 0, z: 0 },
  v: { x: 0, y: 0, z: 0 },
  speed: 1,
  mach: 0,
  alpha: 0,
  beta: 0,
  qbar: 0,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 }, // perfectly vertical
  omega: { x: 0, y: 0, z: 0 },
  mass: 2800,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0.5,
  altitude: 0,
  ...over,
});

describe('tiltFromVertical', () => {
  it('is 0 nose-up and grows with pitch error', () => {
    expect(tiltFromVertical(Math.PI / 2)).toBeCloseTo(0, 10);
    expect(tiltFromVertical(Math.PI / 2 - 0.1)).toBeCloseTo(0.1, 6);
  });
});

describe('classifyLanding priority ladder', () => {
  it('success when everything is nominal', () => {
    expect(classifyLanding(summary({}), frame({}), cfg).kind).toBe('success');
  });
  it('rud beats every other failure', () => {
    const v = classifyLanding(
      summary({ touchdownVz: 40, missDistance: 500 }),
      frame({ mass: cfg.mass.dryKg }), // also out of propellant
      cfg,
    );
    expect(v.kind).toBe('rud');
  });
  it('out-of-propellant beats hard-landing', () => {
    const v = classifyLanding(summary({ touchdownVz: 10 }), frame({ mass: cfg.mass.dryKg }), cfg);
    expect(v.kind).toBe('out-of-propellant');
  });
  it('hard landing above the vz limit with propellant left', () => {
    expect(classifyLanding(summary({ touchdownVz: 5 }), frame({}), cfg).kind).toBe('hard-landing');
  });
  it('tip-over above the tilt limit', () => {
    const v = classifyLanding(summary({}), frame({ euler: { phi: 0, theta: Math.PI / 2 - 0.2, psi: 0 } }), cfg);
    expect(v.kind).toBe('tip-over'); // 0.2 rad ≈ 11.5° > 5°
  });
  it('missed-pad when soft but outside the radius', () => {
    expect(classifyLanding(summary({ missDistance: 40 }), frame({}), cfg).kind).toBe('missed-pad');
  });
  it('no-touchdown when the time cap was hit', () => {
    expect(classifyLanding(summary({ touchedDown: false }), frame({}), cfg).kind).toBe('no-touchdown');
    expect(classifyLanding(undefined, undefined, cfg).kind).toBe('no-touchdown');
  });
});
