import { loadAeroTable } from '@fds/rocket-sim';
import type { AeroTable } from '@fds/rocket-sim';
import type { RocketDesign } from './components.js';
import { barrowman } from './barrowman.js';
import { cd0 } from './drag.js';

export interface AeroTableSpec {
  machGrid: number[];
  aoaDegGrid: number[];
}

export const DEFAULT_GRID: AeroTableSpec = {
  machGrid: [0, 0.1, 0.3, 0.5, 0.7, 0.9],
  aoaDegGrid: [0, 2, 5, 10, 15],
};

const CMQ = -8;
const CNR = -8;
const CLP = -0.01;

export const aeroTable = (
  design: RocketDesign,
  grid: AeroTableSpec = DEFAULT_GRID,
): { table: AeroTable; csv: string; cpFromNoseM: number } => {
  const b = barrowman(design);
  const lines: string[] = ['Mach,AoA_deg,CA,CN,Cm,CY,Cl,Cn,Clp,Cmq,Cnr'];
  for (const mach of grid.machGrid) {
    const CA = cd0(design, Math.max(mach, 0.05));
    for (const aoaDeg of grid.aoaDegGrid) {
      const CN = b.CNalpha * (aoaDeg * Math.PI) / 180;
      lines.push([mach, aoaDeg, CA, CN, 0, 0, 0, 0, CLP, CMQ, CNR].join(','));
    }
  }
  const csv = lines.join('\n');
  return { table: loadAeroTable(csv), csv, cpFromNoseM: b.cpFromNoseM };
};
