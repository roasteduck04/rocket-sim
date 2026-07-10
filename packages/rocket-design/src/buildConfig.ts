import { G0 } from '@fds/physics-core';
import type { RocketConfig } from '@fds/rocket-sim';
import type { RocketDesign } from './components.js';
import type { Motor } from './motors.js';
import { dryMassProps, partStations } from './massModel.js';
import { barrowman } from './barrowman.js';
import { aeroTable } from './aeroTable.js';

const overallLengthM = (design: RocketDesign): number => {
  const stations = partStations(design);
  return design.parts.reduce((max, p, i) => {
    const len = p.kind === 'fins' ? p.rootChordM : p.kind === 'mass' ? 0 : p.lengthM;
    return Math.max(max, stations[i] + len);
  }, 0);
};

export const buildRocketConfig = (design: RocketDesign, motor: Motor): RocketConfig => {
  const dry = dryMassProps(design);
  const b = barrowman(design);
  const { table, cpFromNoseM } = aeroTable(design);
  const length = overallLengthM(design);
  const diameter = 2 * b.refRadiusM;

  // Motor sits at the aft body end; grain length = motor length, aft face at `length`.
  const motorAft = length;
  const motorFore = length - motor.lengthM;
  const propCgFull = (motorFore + motorAft) / 2;
  const effIsp = motor.propellantKg > 0 ? motor.totalImpulseNs / (G0 * motor.propellantKg) : 1;

  return {
    name: design.name,
    mass: {
      dryKg: dry.massKg,
      propellantKg: motor.propellantKg,
      dryCgFromNoseM: dry.cgFromNoseM,
      propellantCgFromNoseM: propCgFull,
      tankBottomFromNoseM: motorAft,
      tankRadiusM: motor.diameterM / 2,
      dryInertiaKgm2: { Ixx: dry.Ixx, Iyy: dry.Iyy, Izz: dry.Izz },
    },
    geometry: { lengthM: length, diameterM: diameter, refAreaM2: b.refAreaM2 },
    propulsion: {
      thrustCurve: motor.thrustCurve,
      ispSeaLevelS: effIsp,
      ispVacuumS: effIsp,
      gimbal: { maxDeflectionRad: 0, maxSlewRateRps: 0, positionFromNoseM: motorAft },
      throttle: { min: 1, max: 1 },
    },
    aero: { table, cpFromNoseM },
    guidance: { kickStartS: 0, kickDurationS: 0, kickDeflectionRad: 0 },
    // control omitted → passive, aerodynamically-stable flight.
  };
};
