/**
 * Phase 6 smoke tests (plan: "a smoke test that the app builds and each
 * module mounts"). jsdom cannot provide WebGL, so the react-three-fiber
 * scene is stubbed; everything else — YAML loaders, state-space build, the
 * live modal analysis — runs the real workspace-package code at mount.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// jsdom lacks ResizeObserver (used by Recharts' ResponsiveContainer).
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as Record<string, unknown>)['ResizeObserver'] = ResizeObserverStub;
  }
});

vi.mock('../src/modules/rocket/TrajectoryScene', () => ({
  TrajectoryScene: () => <div data-testid="trajectory-scene-stub" />,
}));

import App from '../src/App';
import { RocketView } from '../src/modules/rocket/RocketView';
import { ReentryView } from '../src/modules/reentry/ReentryView';
import { AircraftView } from '../src/modules/aircraft/AircraftView';

afterEach(cleanup);

describe('app shell', () => {
  it('lands on the overview by default and enters a module from it', () => {
    render(<App />);
    expect(screen.getByText(/Flight Dynamics & Controls Simulation Suite/)).toBeTruthy();
    // Default front door: the flight-envelope map + the four module tabs.
    expect(screen.getByRole('group', { name: /Flight envelope/ })).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /· (Rocket|Reentry|Aircraft|Landing)/ }),
    ).toHaveLength(4);
    // Clicking a module launcher (card or envelope waypoint) enters that module.
    fireEvent.click(screen.getAllByRole('button', { name: /Enter Module A — Rocket/ })[0]);
    expect(screen.getByTestId('trajectory-scene-stub')).toBeTruthy();
  });

  it('switches between all four modules via the tab bar', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'B · Reentry' }));
    expect(screen.getByText(/Entry conditions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'C · Aircraft' }));
    expect(screen.getByText(/Aircraft & trim/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'D · Landing' }));
    expect(screen.getByText(/Flight Envelope/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A · Rocket' }));
    expect(screen.getByTestId('trajectory-scene-stub')).toBeTruthy();
  });
});

describe('module A — rocket view', () => {
  it('mounts with the reference-booster scenario panel', () => {
    render(<RocketView />);
    expect(screen.getByText(/Scenario — Reference TVC Booster/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Run simulation/ })).toBeTruthy();
  });
});

describe('module B — reentry view', () => {
  it('mounts with the generic capsule and the corridor chart', () => {
    render(<ReentryView />);
    // Vehicle name parsed from the real §8.2 YAML by the real loader.
    expect(screen.getByText(/Entry conditions — Generic Capsule/)).toBeTruthy();
    expect(
      screen.getByRole('application', { name: /Entry corridor chart/ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Compute corridor/ })).toBeTruthy();
  });
});

describe('module C — aircraft view', () => {
  it('mounts the cockpit with a live modal analysis of the Navion', () => {
    render(<AircraftView />);
    expect(screen.getByRole('img', { name: /Attitude indicator/ })).toBeTruthy();
    expect(screen.getByRole('application', { name: /Virtual control stick/ })).toBeTruthy();
    // The real eig4x4 → modalAnalysis pipeline ran at mount: all five classic
    // modes of the Navion derivative set appear in the readout table.
    const table = screen.getByRole('table');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText(/Short period/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Phugoid/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dutch roll/).length).toBeGreaterThan(0);
  });
});

describe('module D — landing sim', () => {
  it('mounts in setup mode with the entry-point panel and a Launch button', async () => {
    const { LandingSimView } = await import('../src/features/landing-sim/LandingSimView');
    render(<LandingSimView />);
    expect(screen.getByText(/Flight Envelope/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Launch/ })).toBeTruthy();
  });
});
