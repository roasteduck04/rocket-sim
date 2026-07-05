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
  const destroyed = touchdown !== null && touchdown.verdict.kind === 'rud' && touchdown.tSince > 0.1;
  if (!destroyed) {
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
  }

  // Touchdown overlay: per-verdict visuals (landing-sim spec §7). Everything
  // is a pure function of tSince — replays are identical, no randomness.
  if (touchdown) {
    const { verdict, tSince } = touchdown;
    const pad = worldToScreen(0, 0, cam, W, H);
    const site = worldToScreen(sample.northM, 0, cam, W, H);
    const a = Math.min(1, tSince / 0.8); // 0→1 intro ramp

    switch (verdict.kind) {
      case 'success': {
        const pulse = (tSince % 1.2) / 1.2;
        ctx.strokeStyle = STATUS.good;
        ctx.globalAlpha = 1 - pulse;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, 10 + pulse * 60, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'hard-landing':
      case 'out-of-propellant': {
        // Impact flash + dust ring at the touchdown site.
        ctx.globalAlpha = Math.max(0, 1 - tSince) * 0.7;
        ctx.fillStyle = STATUS.serious;
        ctx.beginPath();
        ctx.arc(site.x, site.y, 14 + tSince * 40, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'tip-over': {
        // The silhouette above already drew upright; overlay a falling bar
        // rotating from the tilt to horizontal over 1.5 s about the base.
        const fall = Math.min(1, tSince / 1.5);
        const ang = (Math.PI / 2) * fall;
        const len = Math.max(16, 12 / cam.metersPerPx);
        ctx.strokeStyle = STATUS.critical;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(site.x, site.y);
        ctx.lineTo(site.x + Math.sin(ang) * len, site.y - Math.cos(ang) * len);
        ctx.stroke();
        break;
      }
      case 'missed-pad': {
        // Dashed line pad → touchdown point with the miss distance labelled.
        ctx.strokeStyle = STATUS.warning;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(pad.x, pad.y);
        ctx.lineTo(site.x, site.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = STATUS.warning;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(
          `${Math.abs(sample.northM).toFixed(0)} m`,
          (pad.x + site.x) / 2 + 6,
          (pad.y + site.y) / 2 - 6,
        );
        ctx.globalAlpha = 1;
        break;
      }
      case 'rud': {
        // Expanding burst + 12 debris shards on fixed deterministic angles.
        const r = 8 + tSince * 90;
        ctx.globalAlpha = Math.max(0, 1 - tSince / 1.6);
        ctx.fillStyle = STATUS.serious;
        ctx.beginPath();
        ctx.arc(site.x, site.y, r * 0.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = STATUS.critical;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const th = (i / 12) * 2 * Math.PI;
          const rr = r * (0.7 + 0.3 * ((i * 7) % 5) / 5); // fixed per-shard spread
          ctx.beginPath();
          ctx.moveTo(site.x + Math.cos(th) * r * 0.3, site.y + Math.sin(th) * r * 0.3);
          ctx.lineTo(site.x + Math.cos(th) * rr, site.y + Math.sin(th) * rr);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'no-touchdown':
        break; // banner chip suffices
    }
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
