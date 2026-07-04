/**
 * @fds/rocket-sim — 6-DOF rocket flight simulator (README §4).
 *
 * Pipeline: YAML vehicle config + thrust-curve/aero CSVs → instantaneous mass
 * properties, aero, and propulsion → 6-DOF EOM (`derivRocket`) → fixed-step RK4
 * run (`runRocketSim`) under a guidance law: open-loop gravity-turn ascent
 * (Phase 2), PID attitude-hold via the cascaded TVC controller (Phase 3), or
 * the suicide-burn powered descent flown by `runLandingSim` (Phase 4).
 */

export * from './types.js';
export * from './control/pid.js';
export * from './control/attitudeControl.js';
export * from './state.js';
export * from './massProperties.js';
export * from './aero.js';
export * from './propulsion.js';
export * from './tvc.js';
export * from './deriv.js';
export * from './guidance.js';
export * from './guidance/landing.js';
export * from './guidance/socp.js';
export * from './guidance/pdg.js';
export * from './guidance/boostback.js';
export * from './guidance/entryDescent.js';
export * from './sim.js';
export * from './loader.js';
