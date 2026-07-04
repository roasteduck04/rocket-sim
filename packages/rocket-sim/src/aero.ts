/**
 * Aerodynamics: table ingestion, bilinear interpolation, and body-frame force /
 * moment assembly (README §4.3, plan A11/A12).
 *
 * Table CSV columns (README §4.3):
 *   `Mach, AoA_deg, CA, CN, Cm, CY, Cl, Cn, Clp, Cmq, Cnr`
 *
 * Force (body axes X-fwd/Y-right/Z-down):
 *   `F_aero = q̄·S·[−C_A, C_Y, −C_N]`.
 *
 * Moments are taken about the INSTANTANEOUS CG (trap T1). The static normal /
 * side forces act at the center of pressure `X_cp`, so their moment about the CG
 * is the force × the (CP−CG) arm; the table's `Cm`/`Cn` columns are residual
 * static moments about the CP (0 for the shipped Barrowman table, so pitch/yaw
 * restoring is purely geometric — this is what makes zero static margin exactly
 * neutral, README §10.2.2). Damping enters through `Cmq, Cnr, Clp` with the
 * non-dimensional rates `q̂ = q·d/(2V)` etc. (README §4.3).
 *
 * Axisymmetric-vehicle assumption (A12): the side plane reuses the normal-force
 * curve evaluated at `|β|` with the sign restored, so one table serves both
 * planes.
 */

import { radToDeg, vnorm, vsub, type Vec3 } from '@fds/physics-core';
import type { AeroCoeffs, AeroConfig, AeroRow, AeroTable, Geometry } from './types.js';

const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Table ingestion
// ---------------------------------------------------------------------------

const COLS = 11;

/**
 * Parse an aero table CSV into a rectangular (Mach × AoA) grid. A leading
 * non-numeric header row is skipped; blank lines and `#` comments are ignored.
 * Every (Mach, AoA) node must be present exactly once.
 */
export const loadAeroTable = (csv: string): AeroTable => {
  const machSet = new Set<number>();
  const aoaSet = new Set<number>();
  const parsed: AeroRow[] = [];

  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(',').map((s) => s.trim());
    // Skip a header row (first field not a number).
    if (Number.isNaN(Number(parts[0]))) continue;
    if (parts.length < COLS) {
      throw new Error(`aero table: expected ${COLS} columns, got ${parts.length} in "${line}"`);
    }
    const n = parts.map(Number);
    if (n.some((v) => !Number.isFinite(v))) {
      throw new Error(`aero table: non-numeric value in "${line}"`);
    }
    const row: AeroRow = {
      mach: n[0], aoaDeg: n[1], CA: n[2], CN: n[3], Cm: n[4], CY: n[5],
      Cl: n[6], Cn: n[7], Clp: n[8], Cmq: n[9], Cnr: n[10],
    };
    parsed.push(row);
    machSet.add(row.mach);
    aoaSet.add(row.aoaDeg);
  }

  const machGrid = [...machSet].sort((a, b) => a - b);
  const aoaGrid = [...aoaSet].sort((a, b) => a - b);
  if (machGrid.length === 0 || aoaGrid.length === 0) {
    throw new Error('aero table: no data rows');
  }

  const machIdx = new Map(machGrid.map((m, i) => [m, i]));
  const aoaIdx = new Map(aoaGrid.map((a, i) => [a, i]));
  const rows: AeroRow[][] = machGrid.map(() => new Array<AeroRow>(aoaGrid.length));
  const seen = machGrid.map(() => new Array<boolean>(aoaGrid.length).fill(false));

  for (const row of parsed) {
    const i = machIdx.get(row.mach)!;
    const j = aoaIdx.get(row.aoaDeg)!;
    if (seen[i][j]) throw new Error(`aero table: duplicate node (Mach ${row.mach}, AoA ${row.aoaDeg})`);
    rows[i][j] = row;
    seen[i][j] = true;
  }
  for (let i = 0; i < machGrid.length; i++) {
    for (let j = 0; j < aoaGrid.length; j++) {
      if (!seen[i][j]) {
        throw new Error(`aero table: missing node (Mach ${machGrid[i]}, AoA ${aoaGrid[j]}) — grid must be complete`);
      }
    }
  }
  return { machGrid, aoaGrid, rows };
};

/** Bracketing indices `[lo, hi]` and blend fraction `t` for `x` in `grid`. */
const bracket = (grid: number[], x: number): [number, number, number] => {
  if (grid.length === 1) return [0, 0, 0];
  const xc = clamp(x, grid[0], grid[grid.length - 1]);
  let hi = 1;
  while (hi < grid.length - 1 && grid[hi] < xc) hi++;
  const lo = hi - 1;
  const span = grid[hi] - grid[lo];
  const t = span === 0 ? 0 : (xc - grid[lo]) / span;
  return [lo, hi, t];
};

const COEF_KEYS = ['CA', 'CN', 'Cm', 'CY', 'Cl', 'Cn', 'Clp', 'Cmq', 'Cnr'] as const;

/** Bilinear interpolation of all coefficients at `(mach, aoaDeg)` (edge-clamped). */
export const interpAero = (table: AeroTable, mach: number, aoaDeg: number): AeroCoeffs => {
  const [mi, mj, mt] = bracket(table.machGrid, mach);
  const [ai, aj, at] = bracket(table.aoaGrid, aoaDeg);
  const r00 = table.rows[mi][ai];
  const r01 = table.rows[mi][aj];
  const r10 = table.rows[mj][ai];
  const r11 = table.rows[mj][aj];
  const out = {} as Record<(typeof COEF_KEYS)[number], number>;
  for (const k of COEF_KEYS) {
    const c0 = r00[k] * (1 - at) + r01[k] * at;
    const c1 = r10[k] * (1 - at) + r11[k] * at;
    out[k] = c0 * (1 - mt) + c1 * mt;
  }
  return out as AeroCoeffs;
};

// ---------------------------------------------------------------------------
// Force / moment assembly
// ---------------------------------------------------------------------------

export interface AeroResult {
  /** Aerodynamic force in body axes, N. */
  F: Vec3;
  /** Aerodynamic moment about the combined CG, body axes, N·m. */
  M: Vec3;
  /** Angle of attack, rad. */
  alpha: number;
  /** Sideslip, rad. */
  beta: number;
  mach: number;
  /** Dynamic pressure, Pa. */
  qbar: number;
  /** Airspeed magnitude, m/s. */
  speed: number;
  /** Static margin (X_cp − X_cg)/d_ref, calibers. */
  staticMargin: number;
}

export interface AeroInputs {
  /** Body-frame velocity, m/s. */
  vBody: Vec3;
  /** Wind in the body frame (already rotated NED→body), m/s. */
  windBody: Vec3;
  /** Body angular rate, rad/s. */
  omega: Vec3;
  /** Air density at the current altitude, kg/m³. */
  rho: number;
  /** Speed of sound at the current altitude, m/s. */
  a: number;
  /** Instantaneous CG station from the nose, m. */
  cgFromNose: number;
}

/**
 * Aerodynamic force (body) and moment (about the combined CG) plus the derived
 * flow quantities (README §4.3). Below a tiny airspeed there is no aerodynamic
 * force; the static margin is still reported (it is purely geometric).
 */
export const aeroForcesMoments = (
  geom: Geometry,
  aero: AeroConfig,
  inp: AeroInputs,
): AeroResult => {
  const S = geom.refAreaM2;
  const d = geom.diameterM;
  const arm = aero.cpFromNoseM - inp.cgFromNose; // + when CP aft of CG (stable)
  const staticMargin = arm / d;

  const vRel = vsub(inp.vBody, inp.windBody);
  const speed = vnorm(vRel);
  if (speed < 1e-6) {
    return {
      F: { x: 0, y: 0, z: 0 },
      M: { x: 0, y: 0, z: 0 },
      alpha: 0, beta: 0, mach: 0, qbar: 0, speed: 0, staticMargin,
    };
  }

  const alpha = Math.atan2(vRel.z, vRel.x); // atan2(w_rel, u_rel)
  const beta = Math.asin(clamp(vRel.y / speed, -1, 1));
  const mach = speed / inp.a;
  const qbar = 0.5 * inp.rho * speed * speed;
  const qS = qbar * S;
  const qSd = qS * d;

  const pitch = interpAero(aero.table, mach, Math.abs(radToDeg(alpha)));
  const side = interpAero(aero.table, mach, Math.abs(radToDeg(beta)));

  const CA = pitch.CA;
  const CN = sgn(alpha) * pitch.CN;
  const CY = sgn(beta) * side.CN; // axisymmetric side force from the normal curve (A12)

  const Fx = -qS * CA;
  const Fy = qS * CY;
  const Fz = -qS * CN;

  // Non-dimensional body rates for the damping derivatives.
  const k = d / (2 * speed);
  const phat = inp.omega.x * k;
  const qhat = inp.omega.y * k;
  const rhat = inp.omega.z * k;

  // Static couples: force at CP about the CG, r_(cg→cp) = (−arm, 0, 0).
  const pitchCouple = arm * Fz; // = −q̄·S·C_N·arm
  const yawCouple = -arm * Fy; // = −q̄·S·C_Y·arm
  // Residual static table moments about the CP (0 for shipped table).
  const pitchTable = qSd * sgn(alpha) * pitch.Cm;
  const yawTable = qSd * sgn(beta) * side.Cn;
  // Aerodynamic damping.
  const pitchDamp = qSd * pitch.Cmq * qhat;
  const yawDamp = qSd * side.Cnr * rhat;
  const roll = qSd * (pitch.Cl + pitch.Clp * phat);

  return {
    F: { x: Fx, y: Fy, z: Fz },
    M: {
      x: roll,
      y: pitchCouple + pitchTable + pitchDamp,
      z: yawCouple + yawTable + yawDamp,
    },
    alpha, beta, mach, qbar, speed, staticMargin,
  };
};
