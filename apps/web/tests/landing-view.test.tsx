/**
 * Module D view flow with a stubbed Worker: launch posts an entry-run, the
 * synthetic result switches to flight mode, and the verdict stays hidden
 * until playback completes (spec §3 "no spoilers").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TelemetryFrame } from '@fds/rocket-sim';
import type { EntryRunResult, LandingSimRequest } from '../src/lib/simWorker';
import { phaseAt } from '../src/features/landing-sim/Dashboard';

const frame = (t: number, altitude: number): TelemetryFrame => ({
  t,
  r: { x: 0, y: 0, z: -altitude },
  v: { x: -10, y: 0, z: 0 },
  speed: 10,
  mach: 0.03,
  alpha: 0,
  beta: 0,
  qbar: 60,
  euler: { phi: 0, theta: Math.PI / 2, psi: 0 },
  omega: { x: 0, y: 0, z: 0 },
  mass: 3000,
  staticMargin: 0,
  deltaP: 0,
  deltaY: 0,
  throttle: 0.6,
  altitude,
});

const RESULT: EntryRunResult = {
  kind: 'entry-result',
  telemetry: [frame(0, 100), frame(5, 50), frame(10, 0)],
  summary: {
    apogeeAltitude: 100, apogeeTime: 0, maxMach: 1, maxQbar: 100, maxQbarTime: 0,
    maxAxialG: 2, maxAxialGTime: 0, maxLateralG: 0.1, maxLateralGTime: 0,
    burnoutTime: null, flightTime: 10,
    landing: {
      touchedDown: true, ignitionTime: 2, touchdownVz: 1.0,
      touchdownLateralSpeed: 0.2, missDistance: 3, touchdownG: 1.1, propellantUsedKg: 400,
    },
  },
  entryBurnIgnitionTime: 1,
  entryBurnCutoffTime: 3,
  landingIgnitionTime: 6,
};

/** Worker stub: records posts; the test fires responses by hand. */
class WorkerStub {
  static last: WorkerStub | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  posted: LandingSimRequest[] = [];
  constructor() {
    WorkerStub.last = this;
  }
  postMessage(msg: LandingSimRequest): void {
    this.posted.push(msg);
  }
  terminate(): void {}
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', WorkerStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('phaseAt', () => {
  it('walks FREEFALL → ENTRY BURN → FREEFALL → LANDING BURN → TOUCHDOWN', () => {
    const times = { entryBurnIgnitionTime: 1, entryBurnCutoffTime: 3, landingIgnitionTime: 6 };
    expect(phaseAt(0.5, times, 10)).toBe('FREEFALL');
    expect(phaseAt(2, times, 10)).toBe('ENTRY BURN');
    expect(phaseAt(4, times, 10)).toBe('FREEFALL');
    expect(phaseAt(7, times, 10)).toBe('LANDING BURN');
    expect(phaseAt(10, times, 10)).toBe('TOUCHDOWN');
  });
});

describe('LandingSimView flow', () => {
  it('posts a capture sweep on mount and an entry-run on Launch, then flies', async () => {
    const { LandingSimView } = await import('../src/features/landing-sim/LandingSimView');
    render(<LandingSimView />);
    const w = WorkerStub.last!;
    expect(w.posted.some((m) => m.kind === 'capture')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Launch/ }));
    const run = w.posted.find((m) => m.kind === 'entry-run');
    expect(run).toBeTruthy();

    w.reply(RESULT);
    // Flight mode: canvas + HUD mounted; verdict hidden (playback at t=0).
    expect(await screen.findByRole('img', { name: /Landing simulation view/ })).toBeTruthy();
    expect(screen.getByText(/Telemetry/)).toBeTruthy();
    expect(screen.queryByText(/landing is confirmed/i)).toBeNull();
  });
});
