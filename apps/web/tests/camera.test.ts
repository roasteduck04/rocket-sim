/** Dynamic-zoom camera (landing-sim spec §6): one continuous shot. */
import { describe, expect, it } from 'vitest';
import { cameraFor, worldToScreen } from '../src/features/landing-sim/camera';

const W = 760;
const H = 520;

describe('cameraFor / worldToScreen', () => {
  it('keeps the rocket anchored ~62% up the frame while high', () => {
    for (const h of [30000, 15000, 5000, 1000]) {
      const cam = cameraFor(h, 0, H);
      const { y } = worldToScreen(0, h, cam, W, H);
      expect(y).toBeCloseTo(H * (1 - 0.62), 0); // ±0.5 px
    }
  });
  it('shows the ground line inside the frame on final approach', () => {
    const cam = cameraFor(40, 0, H);
    const ground = worldToScreen(0, 0, cam, W, H);
    expect(ground.y).toBeLessThanOrEqual(H);
    expect(ground.y).toBeGreaterThan(H * 0.5); // ground in the lower half
    const rocket = worldToScreen(0, 40, cam, W, H);
    expect(rocket.y).toBeGreaterThan(0);
    expect(rocket.y).toBeLessThan(ground.y); // rocket above the ground
  });
  it('zooms monotonically: metersPerPx shrinks as altitude drops', () => {
    const high = cameraFor(20000, 0, H).metersPerPx;
    const mid = cameraFor(2000, 0, H).metersPerPx;
    const low = cameraFor(50, 0, H).metersPerPx;
    expect(mid).toBeLessThan(high);
    expect(low).toBeLessThan(mid);
  });
  it('maps north offsets horizontally about the rocket', () => {
    const cam = cameraFor(1000, -3000, H); // rocket 3 km south of the pad
    const rocket = worldToScreen(-3000, 1000, cam, W, H);
    const pad = worldToScreen(0, 0, cam, W, H);
    expect(rocket.x).toBeCloseTo(W / 2, 6);
    expect(pad.x).toBeGreaterThan(W / 2); // pad to the right (north = +x screen)
  });
});
