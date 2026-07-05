/**
 * Canvas renderer (landing-sim spec §6): flat icon-style vector art — sky
 * gradient by altitude, ground, pad, rocket silhouette at true pitch, flame
 * as a throttle-scaled triangle with a deterministic sim-time flicker (no
 * randomness — runs replay identically). Redrawn every rAF from the current
 * playback sample. Task 12 fills in the per-verdict touchdown visuals.
 */

import { useEffect, useRef, type JSX } from 'react';
import { INK_2, MUTED, STATUS } from '../../lib/palette';
import { cameraFor, worldToScreen } from './camera';
import type { PlaybackSample } from './playbackMath';
import type { Verdict } from './types';

export const CANVAS_W = 760;
export const CANVAS_H = 520;

/** Vehicle length for the silhouette, m (§8.1 reference booster geometry). */
const ROCKET_LEN_M = 12;
/** Landing legs deploy below this AGL (visual-only discrete event, spec origin §3). */
const LEG_DEPLOY_AGL_M = 150;

/** Linear blend of two #rrggbb colors. */
const mix = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export interface TouchdownVisual {
  verdict: Verdict;
  /** Seconds of sim time since touchdown (drives the fail animations). */
  tSince: number;
}

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  sample: PlaybackSample,
  touchdown: TouchdownVisual | null,
): void => {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const cam = cameraFor(sample.altitudeM, sample.northM, H);

  // Sky: space-black above 20 km blending to day blue at the deck.
  ctx.fillStyle = mix('#87b7e4', '#05070f', sample.altitudeM / 20000);
  ctx.fillRect(0, 0, W, H);

  // Ground + pad (world altitude 0), visible once inside the window.
  const ground = worldToScreen(0, 0, cam, W, H);
  if (ground.y <= H + 2) {
    ctx.fillStyle = '#131811';
    ctx.fillRect(0, ground.y, W, H - ground.y + 2);
    const pad = worldToScreen(0, 0, cam, W, H); // pad at north 0 (landing target)
    const padRpx = Math.max(6, 15 / cam.metersPerPx);
    ctx.strokeStyle = STATUS.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, ground.y, padRpx, Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.x - padRpx * 0.5, ground.y);
    ctx.lineTo(pad.x + padRpx * 0.5, ground.y);
    ctx.stroke();
  }

  // Rocket silhouette at true pitch (nose-up θ = π/2 ⇒ upright on screen).
  const pos = worldToScreen(sample.northM, sample.altitudeM, cam, W, H);
  const lenPx = Math.max(16, ROCKET_LEN_M / cam.metersPerPx);
  const wPx = Math.max(4, lenPx / 7);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.PI / 2 - sample.theta); // screen-up when θ = π/2

  // Flame: throttle-scaled triangle at the tail, deterministic flicker.
  if (sample.throttle > 0.01) {
    const flick = 1 + 0.08 * Math.sin(40 * sample.t);
    const flameLen = lenPx * 0.9 * sample.throttle * flick;
    const grad = ctx.createLinearGradient(0, lenPx / 2, 0, lenPx / 2 + flameLen);
    grad.addColorStop(0, STATUS.warning);
    grad.addColorStop(1, 'rgba(236,131,90,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-wPx * 0.45, lenPx / 2);
    ctx.lineTo(wPx * 0.45, lenPx / 2);
    ctx.lineTo(0, lenPx / 2 + flameLen);
    ctx.closePath();
    ctx.fill();
  }

  // Body + nose + fins (+ legs on final approach).
  ctx.fillStyle = INK_2;
  ctx.fillRect(-wPx / 2, -lenPx / 2 + wPx, wPx, lenPx - wPx);
  ctx.beginPath();
  ctx.moveTo(-wPx / 2, -lenPx / 2 + wPx);
  ctx.lineTo(0, -lenPx / 2);
  ctx.lineTo(wPx / 2, -lenPx / 2 + wPx);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.beginPath();
  ctx.moveTo(-wPx / 2, lenPx / 2);
  ctx.lineTo(-wPx * 1.1, lenPx / 2);
  ctx.lineTo(-wPx / 2, lenPx / 2 - wPx * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(wPx / 2, lenPx / 2);
  ctx.lineTo(wPx * 1.1, lenPx / 2);
  ctx.lineTo(wPx / 2, lenPx / 2 - wPx * 1.6);
  ctx.closePath();
  ctx.fill();
  if (sample.altitudeM < LEG_DEPLOY_AGL_M) {
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = Math.max(1.5, wPx * 0.18);
    ctx.beginPath();
    ctx.moveTo(-wPx / 2, lenPx / 2 - wPx);
    ctx.lineTo(-wPx * 1.2, lenPx / 2 + wPx * 0.5);
    ctx.moveTo(wPx / 2, lenPx / 2 - wPx);
    ctx.lineTo(wPx * 1.2, lenPx / 2 + wPx * 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // Touchdown overlay (Task 12 expands this per verdict kind).
  if (touchdown && touchdown.verdict.kind === 'success') {
    const pad = worldToScreen(0, 0, cam, W, H);
    const pulse = (touchdown.tSince % 1.2) / 1.2;
    ctx.strokeStyle = STATUS.good;
    ctx.globalAlpha = 1 - pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 10 + pulse * 60, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
};

export const LandingCanvas = ({
  sample,
  touchdown,
}: {
  sample: PlaybackSample;
  touchdown: TouchdownVisual | null;
}): JSX.Element => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawScene(ctx, sample, touchdown);
  });

  return (
    <canvas
      ref={ref}
      width={CANVAS_W}
      height={CANVAS_H}
      className="scene-canvas"
      role="img"
      aria-label="Landing simulation view"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    />
  );
};
