/**
 * Suite Overview — the four modules, as data.
 *
 * Shared by the flight-envelope plot (EnvelopeMap) and the launcher cards
 * (OverviewView) so a module's accent, copy, and plotted regime are defined
 * once. The `arc`/`node` fields place each module in the real altitude-vs-
 * velocity envelope (README: reentry interface ≈120 km / ~7.8 km/s; landing
 * 6–25 km / 150–800 m/s; aircraft cruise ~1 km / ~60 m/s; rocket ascent from
 * the pad). Accents come from lib/palette.ts — no new hardcoded hex.
 */

import { SERIES, STATUS, LANDING } from '../../lib/palette';

/** The launchable modules (Overview itself is not a target). */
export type LaunchId = 'rocket' | 'reentry' | 'aircraft' | 'landing';

export interface ModuleMeta {
  id: LaunchId;
  code: string; // 'A'…'D'
  name: string;
  /** One-line, plain-language description of what the module does. */
  tagline: string;
  /** Three characteristic capabilities, shown as chips. */
  chips: [string, string, string];
  /** Regime accent (also the plotted trajectory color). */
  accent: string;
  /** Representative point in the envelope: v = m/s, h = m. Anchors the label + readout. */
  node: { v: number; h: number };
  /** Trajectory polyline through the envelope, [v (m/s), h (m)] pairs. */
  arc: ReadonlyArray<readonly [number, number]>;
}

export const MODULES: ReadonlyArray<ModuleMeta> = [
  {
    id: 'rocket',
    code: 'A',
    name: 'Rocket',
    tagline: '6-DOF ascent & landing burn under thrust-vector control.',
    chips: ['Quaternion attitude', 'PID gimbal', 'Variable mass & inertia'],
    accent: SERIES.blue,
    node: { v: 900, h: 42000 },
    arc: [
      [50, 300],
      [280, 8000],
      [900, 42000],
      [1800, 74000],
      [2600, 98000],
    ],
  },
  {
    id: 'reentry',
    code: 'B',
    name: 'Reentry',
    tagline: '3-DOF entry corridor with heating & g-load.',
    chips: ['Sutton–Graves heating', 'Entry corridor', 'Rotating Earth'],
    accent: STATUS.critical,
    node: { v: 7800, h: 120000 },
    arc: [
      [7800, 120000],
      [7400, 80000],
      [6000, 55000],
      [3000, 40000],
      [800, 20000],
      [250, 8000],
    ],
  },
  {
    id: 'aircraft',
    code: 'C',
    name: 'Aircraft',
    tagline: 'Linearized stick-and-rudder flight dynamics.',
    chips: ['Short-period / phugoid', 'Dutch roll', 'Live modal analysis'],
    accent: SERIES.aqua,
    node: { v: 60, h: 1000 },
    // Cruise is a steady trim point, not a trajectory — a tight box reads as "level".
    arc: [
      [52, 900],
      [70, 900],
      [70, 1200],
      [52, 1200],
      [52, 900],
    ],
  },
  {
    id: 'landing',
    code: 'D',
    name: 'Landing',
    tagline: 'Interactive suicide-burn powered descent.',
    chips: ['Capture-region sweep', 'Warp playback', 'Six-way verdict'],
    accent: LANDING.amber,
    node: { v: 450, h: 15000 },
    arc: [
      [800, 25000],
      [500, 15000],
      [200, 6000],
      [80, 1500],
    ],
  },
];
