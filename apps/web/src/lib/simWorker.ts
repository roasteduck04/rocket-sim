/**
 * Web-Worker batch-run protocol (README §7: offline/batch runs execute
 * headless in a worker so the UI thread stays responsive, streaming results
 * back to the charts). This module owns the message types — both the workers
 * and the views import them from here so the two sides can't drift — plus the
 * worker factories (the `new Worker(new URL(...))` literals Vite bundles).
 *
 * All payloads are SI/radians; display conversion happens in the components
 * (unitsDisplay.ts).
 */

import type { LandingScenario, RunSummary, TelemetryFrame } from '@fds/rocket-sim';
import type { ReentryFrame, ReentryPeaks } from '@fds/reentry-sim';

/** Uniform failure message from either worker. */
export interface WorkerFailure {
  kind: 'error';
  message: string;
}

// --- Module A: ascent / landing batch runs ---------------------------------

export interface AscentRequest {
  kind: 'ascent';
  /** Time cap, s (the §8.1 booster is open-loop stable to t ≈ 11 s). */
  maxTime: number;
  /** Record every Nth 0.01 s step. */
  sampleEvery: number;
}

export interface LandingRequest {
  kind: 'landing';
  scenario: LandingScenario;
  sampleEvery: number;
}

export type RocketRequest = AscentRequest | LandingRequest;

export interface RocketResult {
  kind: 'result';
  telemetry: TelemetryFrame[];
  summary: RunSummary;
}

export type RocketResponse = RocketResult | WorkerFailure;

// --- Module B: single reentry run / corridor sweep --------------------------

export interface ReentryRunRequest {
  kind: 'run';
  /** Entry flight-path angle, rad (negative = descending). */
  gammaRad: number;
  vEntryMps: number;
  sampleEvery: number;
}

export interface CorridorRequest {
  kind: 'corridor';
  vRange: [number, number];
  nPoints: number;
}

export type ReentryRequest = ReentryRunRequest | CorridorRequest;

export type TrajectoryClass = 'landed' | 'skipped' | 'limits-exceeded';

export interface ReentryRunResult {
  kind: 'run-result';
  history: ReentryFrame[];
  peaks: ReentryPeaks;
  classification: TrajectoryClass;
}

/** One corridor-sweep point, streamed as soon as its two bisections finish. */
export interface CorridorPointMsg {
  kind: 'corridor-point';
  index: number;
  nPoints: number;
  vEntry: number;
  /** Boundary γ, rad; NaN when the bisection failed at this velocity. */
  gammaOvershoot: number;
  gammaUndershoot: number;
}

export interface CorridorDone {
  kind: 'corridor-done';
}

export type ReentryResponse = ReentryRunResult | CorridorPointMsg | CorridorDone | WorkerFailure;

// --- factories ---------------------------------------------------------------

export const createRocketWorker = (): Worker =>
  new Worker(new URL('../workers/ascent.worker.ts', import.meta.url), { type: 'module' });

export const createReentryWorker = (): Worker =>
  new Worker(new URL('../workers/corridor.worker.ts', import.meta.url), { type: 'module' });
