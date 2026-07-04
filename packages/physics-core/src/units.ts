/**
 * Unit-conversion helpers. Convert at the UI/data boundary only; the physics
 * core runs in SI internally (README §1, §3.5). No conversion factor should be
 * written inline anywhere else.
 */

const FT_PER_M = 3.280839895013123; // 1 / 0.3048
const M_PER_FT = 0.3048;
const N_PER_LBF = 4.4482216152605;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MPS_PER_KT = 0.514444444444444; // 1852 m / 3600 s

export const ftToM = (ft: number): number => ft * M_PER_FT;
export const mToFt = (m: number): number => m * FT_PER_M;
export const lbfToN = (lbf: number): number => lbf * N_PER_LBF;
export const nToLbf = (n: number): number => n / N_PER_LBF;
export const degToRad = (deg: number): number => deg * DEG2RAD;
export const radToDeg = (rad: number): number => rad * RAD2DEG;
export const ktsToMps = (kts: number): number => kts * MPS_PER_KT;
export const mpsToKts = (mps: number): number => mps / MPS_PER_KT;
