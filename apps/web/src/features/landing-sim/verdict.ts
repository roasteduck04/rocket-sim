/**
 * Pass/fail classifier (landing-sim spec §7). Pure function of the finished
 * run — evaluated once when the worker returns, revealed at touchdown.
 * Priority ladder, first match wins: RUD → out-of-propellant → hard landing →
 * tip-over → missed pad → success. All thresholds from config (Task 1 schema).
 */

import { radToDeg } from '@fds/physics-core';
import type { LandingSummary, RocketConfig, TelemetryFrame } from '@fds/rocket-sim';
import type { Verdict } from './types';

/**
 * Tilt from vertical at pitch θ: body +X in NED has down-component −sinθ
 * (independent of ψ, φ for the tilt cone), so cos(tilt) = sinθ.
 */
export const tiltFromVertical = (theta: number): number =>
  Math.acos(Math.min(1, Math.max(-1, Math.sin(theta))));

export const classifyLanding = (
  summary: LandingSummary | undefined,
  finalFrame: TelemetryFrame | undefined,
  cfg: RocketConfig,
): Verdict => {
  const target = cfg.control?.landingTarget;
  const vzMax = target?.touchdownVzMaxMps ?? 2;
  const padR = target?.padRadiusM ?? 15;
  const tiltMax = target?.touchdownTiltMaxRad ?? (5 * Math.PI) / 180;
  const rudSpeed = target?.rudImpactSpeedMps ?? 25;

  if (!summary || !finalFrame || !summary.touchedDown) {
    return { kind: 'no-touchdown', detail: 'Time cap reached before ground contact.' };
  }

  const impactSpeed = Math.hypot(summary.touchdownVz, summary.touchdownLateralSpeed);
  const outOfProp = finalFrame.mass <= cfg.mass.dryKg + 1e-6;
  const tilt = tiltFromVertical(finalFrame.euler.theta);

  if (impactSpeed > rudSpeed) {
    return {
      kind: 'rud',
      detail: `Impact at ${impactSpeed.toFixed(0)} m/s — rapid unscheduled disassembly.`,
    };
  }
  if (outOfProp && Math.abs(summary.touchdownVz) > vzMax) {
    return {
      kind: 'out-of-propellant',
      detail: 'Tanks ran dry before touchdown velocity was nulled.',
    };
  }
  if (Math.abs(summary.touchdownVz) > vzMax) {
    return {
      kind: 'hard-landing',
      detail: `Touchdown at ${Math.abs(summary.touchdownVz).toFixed(1)} m/s (limit ${vzMax} m/s).`,
    };
  }
  if (tilt > tiltMax) {
    return {
      kind: 'tip-over',
      detail: `Touchdown tilt ${radToDeg(tilt).toFixed(1)}° exceeds the ${radToDeg(tiltMax).toFixed(0)}° limit.`,
    };
  }
  if (summary.missDistance > padR) {
    return {
      kind: 'missed-pad',
      detail: `Soft landing ${summary.missDistance.toFixed(0)} m from the pad (radius ${padR} m).`,
    };
  }
  return { kind: 'success', detail: 'The landing is confirmed.' };
};
