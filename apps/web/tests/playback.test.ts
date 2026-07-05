/** Playback interpolation (landing-sim spec §3): binary search + lerp + g-load. */
import { describe, expect, it } from 'vitest';
import { G0 } from '@fds/physics-core';
import type { TelemetryFrame } from '@fds/rocket-sim';
import { frameIndexAt, sampleAt } from '../src/features/landing-sim/playbackMath';

/** Nose-up frame falling straight down at `vz` m/s (body v.x = −climb rate). */
const fallingFrame = (t: number, altitude: number, vzDown: number): TelemetryFrame => ({
  t,
  r: { x: 0, y: 0, z: -altitude },
  v: { x: -vzDown, y: 0, z: 0 }, // body X is up at θ=π/2, so falling ⇒ u = −vz
  speed: vzDown,
  mach: vzDown / 340,
  alpha: 0,
  beta: 0,
  qbar: 0.5 * 1.2 * vzDown * vzDown,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 },
  omega: { x: 0, y: 0, z: 0 },
  mass: 3000,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0,
  altitude,
});

const frames = [
  fallingFrame(0.0, 1000, 50),
  fallingFrame(0.5, 975, 50 + 0.5 * G0), // free fall: vz grows at g
  fallingFrame(1.0, 950, 50 + 1.0 * G0),
];

describe('frameIndexAt', () => {
  it('binary-searches the last frame with t ≤ tSim', () => {
    expect(frameIndexAt(frames, -1)).toBe(0);
    expect(frameIndexAt(frames, 0)).toBe(0);
    expect(frameIndexAt(frames, 0.49)).toBe(0);
    expect(frameIndexAt(frames, 0.5)).toBe(1);
    expect(frameIndexAt(frames, 99)).toBe(2);
  });
});

describe('sampleAt', () => {
  it('lerps scalar fields between the bracketing frames', () => {
    const s = sampleAt(frames, 0.25);
    expect(s.altitudeM).toBeCloseTo(987.5, 6);
    expect(s.mass).toBe(3000);
    expect(s.t).toBe(0.25);
  });
  it('clamps beyond the last frame', () => {
    const s = sampleAt(frames, 5);
    expect(s.altitudeM).toBeCloseTo(950, 6);
  });
  it('reports ~0 g in free fall (gravity subtracted from dv/dt)', () => {
    const s = sampleAt(frames, 0.25);
    expect(s.gLoad).toBeCloseTo(0, 3);
  });
  it('converts body velocity to NED (falling ⇒ vNED.z > 0)', () => {
    const s = sampleAt(frames, 0);
    expect(s.vNED.z).toBeCloseTo(50, 6);
    expect(Math.abs(s.vNED.x)).toBeLessThan(1e-9);
  });
});
