/**
 * Stagnation-point radiative heating — Tauber–Sutton Earth correlation
 * (README §5.2 optional secondary term, Phase 7).
 *
 *   q̇_r = C · R_n^a · ρ^1.22 · f(V)      [W/cm² → returned as W/m²]
 *
 * with C = 4.736×10⁴ and a = 1.072×10⁶ · V^(−1.88) · ρ^(−0.325) for Earth
 * (Tauber & Sutton, "Stagnation-Point Radiative Heating Relations for Earth
 * and Mars Entries", J. Spacecraft & Rockets 28(1), 1991). f(V) is the
 * paper's tabulated radiative velocity function, near-exponential at
 * moderate speeds; it is zero below ~9 km/s, which is exactly why radiative
 * heating is irrelevant for LEO-return-class entries (README §5.2) and only
 * matters for super-orbital (lunar/Mars-return) speeds.
 *
 * Conventions and guards (documented in docs/equations.md Phase 7):
 *  - V below the table (< 9 km/s): q̇_r = 0 (standard practice — e.g. NASA's
 *    aerothermodynamics course notes evaluate q̇_r = 0 for a 3.5 km/s case).
 *  - V above the table (> 16 km/s): f clamped to the 16 km/s value rather
 *    than extrapolating the steep tail.
 *  - Exponent a clamped to [0, 1]: outside the correlation's stated validity
 *    band (roughly 54–72 km altitude) the ρ^(−0.325) factor can push a
 *    unphysically high for metre-class noses in near-vacuum; Tauber–Sutton
 *    quote a ≲ 1 for Earth.
 *  - The tabulated correlation already includes the radiative-cooling
 *    (Goulard/Tauber–Wakefield) effect, so no extra coupling factor is
 *    applied on top.
 */

/** Tauber–Sutton Earth radiative constant (result in W/cm²). */
export const C_TAUBER_SUTTON_EARTH = 4.736e4;

/** Density exponent b for Earth. */
export const B_TAUBER_SUTTON_EARTH = 1.22;

/**
 * Tabulated radiative velocity function f(V) for Earth air (Tauber & Sutton
 * 1991, as reproduced across the secondary literature — the original table
 * is paywalled; provenance note in docs/equations.md Phase 7). Linear
 * interpolation between nodes.
 */
export const F_V_EARTH: ReadonlyArray<readonly [number, number]> = [
  [9_000, 1.5],
  [9_250, 4.3],
  [9_500, 9.7],
  [9_750, 19.5],
  [10_000, 35],
  [10_250, 55],
  [10_500, 81],
  [10_750, 115],
  [11_000, 151],
  [11_500, 238],
  [12_000, 359],
  [12_500, 495],
  [13_000, 660],
  [13_500, 850],
  [14_000, 1065],
  [14_500, 1313],
  [15_000, 1550],
  [15_500, 1780],
  [16_000, 2040],
];

/**
 * Radiative velocity function f(V) for Earth: 0 below the table, linear
 * interpolation inside it, clamped to the last node above it.
 */
export const radiativeVelocityFunction = (V: number): number => {
  const first = F_V_EARTH[0];
  const last = F_V_EARTH[F_V_EARTH.length - 1];
  if (V < first[0]) return 0;
  if (V >= last[0]) return last[1];
  for (let i = 1; i < F_V_EARTH.length; i++) {
    const [v1, f1] = F_V_EARTH[i];
    if (V < v1) {
      const [v0, f0] = F_V_EARTH[i - 1];
      return f0 + ((f1 - f0) * (V - v0)) / (v1 - v0);
    }
  }
  return last[1]; // unreachable; loop covers (first, last)
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Tauber–Sutton stagnation-point radiative heat flux for Earth entry, W/m²
 * (the correlation's native W/cm² × 10⁴).
 *
 * @param rho free-stream density, kg/m³
 * @param V   velocity, m/s
 * @param Rn  effective nose radius, m
 */
export const tauberSuttonEarth = (rho: number, V: number, Rn: number): number => {
  const f = radiativeVelocityFunction(V);
  if (f === 0 || rho <= 0) return 0;
  const a = clamp(1.072e6 * Math.pow(V, -1.88) * Math.pow(rho, -0.325), 0, 1);
  const qWcm2 =
    C_TAUBER_SUTTON_EARTH * Math.pow(Rn, a) * Math.pow(rho, B_TAUBER_SUTTON_EARTH) * f;
  return qWcm2 * 1e4;
};
