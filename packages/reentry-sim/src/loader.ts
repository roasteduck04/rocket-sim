/**
 * Reentry vehicle-config YAML loader (README §8.2).
 *
 * Parses the §8.2 schema with hand-rolled validation, matching the loader
 * conventions of the other modules (js-yaml + explicit checks, no zod).
 */

import { load } from 'js-yaml';
import type { ReentryConfig } from './types.js';

type Dict = Record<string, unknown>;

const asObject = (v: unknown, ctx: string): Dict => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`reentry config: expected "${ctx}" to be a mapping`);
  }
  return v as Dict;
};

const req = (obj: Dict, key: string, ctx: string): number => {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`reentry config: missing or non-numeric required field "${ctx}.${key}"`);
  }
  return v;
};

/** Parse and validate a reentry vehicle config (README §8.2). */
export const loadReentryYaml = (yamlText: string): ReentryConfig => {
  const root = asObject(load(yamlText), 'reentry config root');
  const name = typeof root['name'] === 'string' ? (root['name'] as string) : 'unnamed';

  const hyperD = asObject(root['hypersonic'], 'hypersonic');
  const limitsD = asObject(root['limits'], 'limits');

  const cfg: ReentryConfig = {
    name,
    massKg: req(root, 'mass_kg', 'root'),
    refAreaM2: req(root, 'ref_area_m2', 'root'),
    noseRadiusM: req(root, 'nose_radius_m', 'root'),
    cd: req(hyperD, 'cd', 'hypersonic'),
    clOverCd: req(hyperD, 'cl_over_cd', 'hypersonic'),
    limits: {
      maxHeatFluxWm2: req(limitsD, 'max_heat_flux_w_m2', 'limits'),
      maxGLoad: req(limitsD, 'max_g_load', 'limits'),
    },
    entryInterfaceAltitudeM: req(root, 'entry_interface_altitude_m', 'root'),
  };

  if (cfg.massKg <= 0 || cfg.refAreaM2 <= 0 || cfg.noseRadiusM <= 0 || cfg.cd <= 0) {
    throw new Error('reentry config: mass_kg, ref_area_m2, nose_radius_m and cd must be positive');
  }
  return cfg;
};
