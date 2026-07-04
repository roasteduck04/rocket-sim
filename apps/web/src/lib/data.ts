/**
 * Bundled reference vehicles. The repo-root `data/` files are inlined as raw
 * text by Vite (`?raw`) and parsed with the SAME package loaders the test
 * suite validates (README §7 — zero divergence). Loaders are re-run per call
 * because the returned configs are mutable working copies (the UI overrides
 * scenario fields before handing them to a worker).
 */

import { loadRocketYaml, type RocketConfig } from '@fds/rocket-sim';
import { loadReentryYaml, type ReentryConfig } from '@fds/reentry-sim';
import { loadAircraftYaml, type AircraftConfig } from '@fds/aircraft-sim';

import rocketYaml from '../../../../data/reference-tvc-booster.rocket.yaml?raw';
import thrustCsv from '../../../../data/thrust-curves/booster_main.csv?raw';
import aeroCsv from '../../../../data/aero-tables/booster_aero.csv?raw';
import capsuleYaml from '../../../../data/reentry-vehicles/generic-capsule.reentry.yaml?raw';
import genericAircraftYaml from '../../../../data/aircraft-derivatives/generic-light-single.aircraft.yaml?raw';
import navionYaml from '../../../../data/aircraft-derivatives/navion.aircraft.yaml?raw';

/** §8.1 reference TVC booster with its thrust curve and Barrowman aero table. */
export const referenceRocket = (): RocketConfig =>
  loadRocketYaml(rocketYaml, { thrustCurveCsv: thrustCsv, aeroTableCsv: aeroCsv });

/** §8.2 generic capsule. */
export const genericCapsule = (): ReentryConfig => loadReentryYaml(capsuleYaml);

export type AircraftId = 'navion' | 'generic';

export const AIRCRAFT_LIBRARY: ReadonlyArray<{ id: AircraftId; label: string }> = [
  { id: 'navion', label: 'Navion (Nelson reference)' },
  { id: 'generic', label: 'Generic light single' },
];

export const loadAircraft = (id: AircraftId): AircraftConfig =>
  loadAircraftYaml(id === 'navion' ? navionYaml : genericAircraftYaml);
