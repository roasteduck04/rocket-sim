/**
 * @fds/aircraft-sim — linearized (Etkin-style) longitudinal and
 * lateral-directional aircraft flight-dynamics model (README §6).
 *
 * Pipeline: YAML derivative set → dimensionalize → build state-space A/B →
 * modal analysis (eigenvalues → ω_n, ζ, t½/t2×) → real-time RK4 simulation.
 */

export * from './types.js';
export * from './dimensionalize.js';
export * from './stateSpace.js';
export * from './modal.js';
export * from './loader.js';
export * from './simulate.js';
export * from './nonlinear6dof.js';
