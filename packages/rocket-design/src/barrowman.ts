import type { FinSet, NoseCone, RocketDesign } from './components.js';
import { partStations } from './massModel.js';

export interface AeroBuildup {
  /** Total normal-force slope, per radian, referenced to the body cross-section. */
  CNalpha: number;
  cpFromNoseM: number;
  refRadiusM: number;
  refAreaM2: number;
}

const bodyRadius = (design: RocketDesign): number => {
  for (const p of design.parts) {
    if (p.kind === 'tube') return p.outerRadiusM;
    if (p.kind === 'nose') return p.baseRadiusM;
  }
  return 0.012;
};

const noseTerm = (n: NoseCone): { cna: number; cpFromForeM: number } => ({
  cna: 2,
  cpFromForeM: (n.shape === 'cone' ? 0.666 : 0.466) * n.lengthM,
});

const finTerm = (f: FinSet, R: number): { cna: number; cpFromRootLeM: number } => {
  const cr = f.rootChordM, ct = f.tipChordM, s = f.semiSpanM;
  const lm = Math.hypot(s, f.sweepM + (ct - cr) / 2);
  const Kfb = 1 + R / (s + R);
  const cna = (Kfb * (4 * f.count * (s / (2 * R)) ** 2)) / (1 + Math.sqrt(1 + (2 * lm / (cr + ct)) ** 2));
  const cpFromRootLeM =
    (f.sweepM / 3) * ((cr + 2 * ct) / (cr + ct)) +
    (1 / 6) * (cr + ct - (cr * ct) / (cr + ct));
  return { cna, cpFromRootLeM };
};

export const barrowman = (design: RocketDesign): AeroBuildup => {
  const R = bodyRadius(design);
  const stations = partStations(design);
  let cnaSum = 0;
  let momentSum = 0; // Σ CNα_i · X_i
  design.parts.forEach((part, i) => {
    const fore = stations[i];
    if (part.kind === 'nose') {
      const { cna, cpFromForeM } = noseTerm(part);
      cnaSum += cna;
      momentSum += cna * (fore + cpFromForeM);
    } else if (part.kind === 'fins') {
      const { cna, cpFromRootLeM } = finTerm(part, R);
      cnaSum += cna;
      momentSum += cna * (fore + cpFromRootLeM);
    }
  });
  const cpFromNoseM = cnaSum > 0 ? momentSum / cnaSum : 0;
  return { CNalpha: cnaSum, cpFromNoseM, refRadiusM: R, refAreaM2: Math.PI * R * R };
};

export const staticMarginCal = (design: RocketDesign, cgFromNoseM: number): number => {
  const b = barrowman(design);
  return (b.cpFromNoseM - cgFromNoseM) / (2 * b.refRadiusM);
};
