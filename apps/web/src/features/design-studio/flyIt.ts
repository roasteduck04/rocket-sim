/**
 * Task 15 — "Fly it": run the EXISTING, unmodified @fds/rocket-sim 6-DOF
 * ascent sim on the current Design Studio design and reduce its telemetry to
 * a compact `FlightResult` for the results panel/chart. The sim run is
 * synchronous on the main thread by design (a hobby-rocket open-loop ascent
 * to apogee runs in well under 100 ms) — no worker, no async.
 */

import { openLoopAscent, runRocketSim } from '@fds/rocket-sim';
import type { RocketDesign } from '@fds/rocket-design';
import { buildRocketConfig } from '@fds/rocket-design';
import { MOTORS, MOTOR_IDS } from './motorCatalog';

export interface FlightResult {
  apogeeM: number;
  apogeeTimeS: number;
  maxMach: number;
  maxAxialG: number;
  series: { t: number; altitudeM: number; speedMps: number }[];
}

/**
 * Build the sim config from the design + its selected motor, fly an
 * open-loop ascent, and reduce the telemetry to apogee (the series is
 * truncated at `summary.apogeeTime` — the ascent leg only, no descent).
 */
export const fly = (design: RocketDesign): FlightResult => {
  const motor = MOTORS[design.motorId] ?? MOTORS[MOTOR_IDS[0]];
  const cfg = buildRocketConfig(design, motor);
  const res = runRocketSim(cfg, openLoopAscent(cfg), { maxTime: 60, sampleEvery: 5 });
  const upTo = res.telemetry.filter((f) => f.t <= res.summary.apogeeTime);
  return {
    apogeeM: res.summary.apogeeAltitude,
    apogeeTimeS: res.summary.apogeeTime,
    maxMach: res.summary.maxMach,
    maxAxialG: res.summary.maxAxialG,
    series: upTo.map((f) => ({ t: f.t, altitudeM: f.altitude, speedMps: f.speed })),
  };
};
