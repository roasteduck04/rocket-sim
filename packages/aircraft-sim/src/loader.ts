/**
 * Aircraft derivative-set YAML loader (README §8.3 + Ambiguity A2).
 *
 * Reads the §8.3 schema, validates the required fields, applies the A2 defaults
 * (optional derivatives → 0; trim `CL0 = m·g/(q̄0·S)` when omitted), and converts
 * θ0 from degrees to radians. Uses `js-yaml` + hand-rolled validators (no zod),
 * per the project's minimal-dependency philosophy.
 */

import { load } from 'js-yaml';
import { atmosphere } from '@fds/atmosphere-models';
import { G0, degToRad } from '@fds/physics-core';
import type { AircraftConfig } from './types.js';

type Dict = Record<string, unknown>;

const asObject = (v: unknown, ctx: string): Dict => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`aircraft config: expected "${ctx}" to be a mapping`);
  }
  return v as Dict;
};

/** Required finite number at `ctx.key`. */
const req = (obj: Dict, key: string, ctx: string): number => {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`aircraft config: missing or non-numeric required field "${ctx}.${key}"`);
  }
  return v;
};

/** Optional finite number, defaulting to `def`; still rejects wrong types. */
const opt = (obj: Dict, key: string, def: number): number => {
  const v = obj[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`aircraft config: field "${key}" must be a number`);
  }
  return v;
};

/** Parse and validate an aircraft derivative set (README §8.3). */
export const loadAircraftYaml = (text: string): AircraftConfig => {
  const root = asObject(load(text), 'aircraft config root');

  const geom = asObject(root['geometry'], 'geometry');
  const mass = asObject(root['mass'], 'mass');
  const trim = asObject(root['trim'], 'trim');
  const lon = asObject(root['longitudinal_derivatives_nondim'], 'longitudinal_derivatives_nondim');
  const lat = asObject(root['lateral_derivatives_nondim'], 'lateral_derivatives_nondim');

  const name = typeof root['name'] === 'string' ? (root['name'] as string) : 'unnamed';

  const geometry = {
    wingAreaM2: req(geom, 'wing_area_m2', 'geometry'),
    chordM: req(geom, 'chord_m', 'geometry'),
    spanM: req(geom, 'span_m', 'geometry'),
  };

  const massProps = {
    massKg: req(mass, 'mass_kg', 'mass'),
    IyyKgm2: req(mass, 'Iyy_kgm2', 'mass'),
    IxxKgm2: req(mass, 'Ixx_kgm2', 'mass'),
    IzzKgm2: req(mass, 'Izz_kgm2', 'mass'),
  };

  const trimCond = {
    U0Mps: req(trim, 'U0_mps', 'trim'),
    theta0Rad: degToRad(req(trim, 'theta0_deg', 'trim')),
    altitudeM: req(trim, 'altitude_m', 'trim'),
  };

  // Trim lift coefficient: explicit if given, else from level-flight balance.
  const rho0 = atmosphere(trimCond.altitudeM).rho;
  const qbar0 = 0.5 * rho0 * trimCond.U0Mps * trimCond.U0Mps;
  const CL0 =
    lon['CL0'] !== undefined
      ? opt(lon, 'CL0', 0)
      : (massProps.massKg * G0) / (qbar0 * geometry.wingAreaM2);

  const lonNonDim = {
    CL0,
    CD0: opt(lon, 'CD0', 0),
    CL_alpha: req(lon, 'CL_alpha', 'longitudinal_derivatives_nondim'),
    CD_alpha: req(lon, 'CD_alpha', 'longitudinal_derivatives_nondim'),
    Cm_alpha: req(lon, 'Cm_alpha', 'longitudinal_derivatives_nondim'),
    Cm_q: req(lon, 'Cm_q', 'longitudinal_derivatives_nondim'),
    Cm_alpha_dot: req(lon, 'Cm_alpha_dot', 'longitudinal_derivatives_nondim'),
    Cm_delta_e: req(lon, 'Cm_delta_e', 'longitudinal_derivatives_nondim'),
    CL_delta_e: opt(lon, 'CL_delta_e', 0),
    CL_u: opt(lon, 'CL_u', 0),
    CD_u: opt(lon, 'CD_u', 0),
    Cm_u: opt(lon, 'Cm_u', 0),
    CL_q: opt(lon, 'CL_q', 0),
    X_delta_t: opt(lon, 'X_delta_t', 0),
  };

  const latNonDim = {
    CY_beta: req(lat, 'CY_beta', 'lateral_derivatives_nondim'),
    Cl_beta: req(lat, 'Cl_beta', 'lateral_derivatives_nondim'),
    Cn_beta: req(lat, 'Cn_beta', 'lateral_derivatives_nondim'),
    Cl_p: req(lat, 'Cl_p', 'lateral_derivatives_nondim'),
    Cn_r: req(lat, 'Cn_r', 'lateral_derivatives_nondim'),
    Cl_delta_a: req(lat, 'Cl_delta_a', 'lateral_derivatives_nondim'),
    Cn_delta_r: req(lat, 'Cn_delta_r', 'lateral_derivatives_nondim'),
    CY_p: opt(lat, 'CY_p', 0),
    CY_r: opt(lat, 'CY_r', 0),
    Cl_r: opt(lat, 'Cl_r', 0),
    Cn_p: opt(lat, 'Cn_p', 0),
    Cl_delta_r: opt(lat, 'Cl_delta_r', 0),
    Cn_delta_a: opt(lat, 'Cn_delta_a', 0),
    CY_delta_a: opt(lat, 'CY_delta_a', 0),
    CY_delta_r: opt(lat, 'CY_delta_r', 0),
  };

  return {
    name,
    geometry,
    mass: massProps,
    trim: trimCond,
    lon: lonNonDim,
    lat: latNonDim,
  };
};
