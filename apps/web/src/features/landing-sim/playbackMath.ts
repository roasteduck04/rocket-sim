/**
 * Pure playback math (landing-sim spec §3): binary search into the recorded
 * telemetry, linear interpolation between bracketing frames, and the HUD's
 * g-load by finite difference of NED velocity with gravity subtracted —
 * computed here at playback so the physics packages stay untouched (spec §7).
 */

import { G0, qfromEuler321, rotateBodyToNED, type Vec3 } from '@fds/physics-core';
import type { TelemetryFrame } from '@fds/rocket-sim';

export interface PlaybackSample {
  t: number;
  northM: number;
  eastM: number;
  altitudeM: number;
  vNED: Vec3;
  speed: number;
  mach: number;
  qbar: number;
  /** Pitch θ, rad (nose-up ≈ π/2). */
  theta: number;
  deltaP: number;
  deltaY: number;
  throttle: number;
  mass: number;
  /** Non-gravitational load factor, g. */
  gLoad: number;
}

/** Index of the last frame with t ≤ tSim (frames sorted by t, length ≥ 1). */
export const frameIndexAt = (frames: TelemetryFrame[], t: number): number => {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

const vNEDof = (f: TelemetryFrame): Vec3 =>
  rotateBodyToNED(qfromEuler321(f.euler.phi, f.euler.theta, f.euler.psi), f.v);

const lerp = (a: number, b: number, s: number): number => a + (b - a) * s;

export const sampleAt = (frames: TelemetryFrame[], t: number): PlaybackSample => {
  const i = frameIndexAt(frames, t);
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const dt = b.t - a.t;
  const s = dt > 0 ? Math.min(1, Math.max(0, (t - a.t) / dt)) : 0;
  const va = vNEDof(a);
  const vb = vNEDof(b);
  // Specific force between the bracketing frames: dv/dt − g. NED z is down,
  // so gravity contributes (0, 0, +G0) and is subtracted from the z channel.
  const gLoad =
    dt > 0
      ? Math.hypot((vb.x - va.x) / dt, (vb.y - va.y) / dt, (vb.z - va.z) / dt - G0) / G0
      : 0;
  return {
    t,
    northM: lerp(a.r.x, b.r.x, s),
    eastM: lerp(a.r.y, b.r.y, s),
    altitudeM: lerp(a.altitude, b.altitude, s),
    vNED: { x: lerp(va.x, vb.x, s), y: lerp(va.y, vb.y, s), z: lerp(va.z, vb.z, s) },
    speed: lerp(a.speed, b.speed, s),
    mach: lerp(a.mach, b.mach, s),
    qbar: lerp(a.qbar, b.qbar, s),
    theta: lerp(a.euler.theta, b.euler.theta, s),
    deltaP: lerp(a.deltaP, b.deltaP, s),
    deltaY: lerp(a.deltaY, b.deltaY, s),
    throttle: lerp(a.throttle, b.throttle, s),
    mass: lerp(a.mass, b.mass, s),
    gLoad,
  };
};
