/**
 * Continuous dynamic-zoom camera (landing-sim spec §6): the vertical view
 * window shrinks with altitude — H_view = clamp(K·h, H_MIN, H_MAX) — with the
 * rocket anchored at ROCKET_ANCHOR of frame height; hLow may go negative
 * (frame bottom below ground level), which keeps the anchor exact all the
 * way to touchdown. Pure math: unit-testable without a canvas.
 */

export interface CameraView {
  metersPerPx: number;
  /** World altitude at the bottom edge of the frame, m (negative once the frame bottom is below ground). */
  hLow: number;
  /** World north coordinate at the horizontal center, m. */
  centerN: number;
}

const H_MIN = 120; // final-approach window height, m
const H_MAX = 60000; // never wider than this, m
const K = 2.2; // window height ≈ K × altitude mid-descent
const ROCKET_ANCHOR = 0.62; // rocket's height in frame, fraction from bottom

export const cameraFor = (
  altitudeM: number,
  rocketNorthM: number,
  viewHpx: number,
): CameraView => {
  const hView = Math.min(H_MAX, Math.max(H_MIN, K * altitudeM));
  const hLow = altitudeM - ROCKET_ANCHOR * hView;
  return { metersPerPx: hView / viewHpx, hLow, centerN: rocketNorthM };
};

export const worldToScreen = (
  northM: number,
  altitudeM: number,
  cam: CameraView,
  viewWpx: number,
  viewHpx: number,
): { x: number; y: number } => ({
  x: viewWpx / 2 + (northM - cam.centerN) / cam.metersPerPx,
  y: viewHpx - (altitudeM - cam.hLow) / cam.metersPerPx,
});
