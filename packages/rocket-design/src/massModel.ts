import type { BodyTube, FinSet, MassComponent, NoseCone, Part, RocketDesign } from './components.js';
import { density } from './materials.js';

export interface PartMass {
  massKg: number;
  cgFromNoseM: number;
  /** Axial inertia about the part CG, kg·m². */
  IxxAboutCg: number;
  /** Transverse inertia about the part CG (about a lateral axis through the CG), kg·m². */
  ItransAboutCg: number;
}

const tubeMass = (t: BodyTube): PartMass & { L: number } => {
  const ro = t.outerRadiusM;
  const ri = Math.max(0, ro - t.wallThicknessM);
  const L = t.lengthM;
  const m = density(t.material) * Math.PI * (ro * ro - ri * ri) * L;
  // Thin-wall cylinder about its own centroid.
  const Ixx = 0.5 * m * (ro * ro + ri * ri);
  const Itrans = (m / 12) * (3 * (ro * ro + ri * ri) + L * L);
  return { massKg: m, cgFromNoseM: L / 2, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L };
};

const noseMass = (n: NoseCone): PartMass & { L: number } => {
  // Thin shell approximated as a cone frustum of slant surface: mass ≈ ρ·t·A_surface.
  const R = n.baseRadiusM;
  const L = n.lengthM;
  const slant = Math.hypot(R, L);
  const area = Math.PI * R * slant; // lateral surface of a cone
  const m = density(n.material) * n.wallThicknessM * area;
  // Solid-cone CG is 3/4·L from the tip; a thin conical shell is 2/3·L. Use shell.
  const cg = (2 / 3) * L;
  // Coarse inertia (thin cone shell): axial ≈ ½·m·R²; transverse ≈ m·(R²/4 + L²/18).
  const Ixx = 0.5 * m * R * R;
  const Itrans = m * (R * R / 4 + L * L / 18);
  return { massKg: m, cgFromNoseM: cg, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L };
};

const finSetMass = (f: FinSet): PartMass & { L: number } => {
  // Flat trapezoidal plates. Planform area of one fin:
  const area = 0.5 * (f.rootChordM + f.tipChordM) * f.semiSpanM;
  const oneMass = density(f.material) * f.thicknessM * area;
  const m = oneMass * f.count;
  // Chordwise centroid of a trapezoid from the root LE:
  const cgChord =
    (f.rootChordM + 2 * f.tipChordM) / (3 * (f.rootChordM + f.tipChordM)) * f.sweepM +
    (f.rootChordM * f.rootChordM + f.rootChordM * f.tipChordM + f.tipChordM * f.tipChordM) /
      (3 * (f.rootChordM + f.tipChordM));
  // Coarse: treat the fin ring inertia as plates at the body radius; small vs body — approximate.
  const Ixx = m * (f.semiSpanM * f.semiSpanM) / 3; // fins spread radially
  const Itrans = m * (f.rootChordM * f.rootChordM) / 12;
  return { massKg: m, cgFromNoseM: cgChord, IxxAboutCg: Ixx, ItransAboutCg: Itrans, L: f.rootChordM };
};

/** Mass properties of one part, given its fore (leading) station from the nose. */
export const partMass = (part: Part, stationFromNoseM: number): PartMass => {
  let base: PartMass & { L: number };
  switch (part.kind) {
    case 'tube': base = tubeMass(part); break;
    case 'nose': base = noseMass(part); break;
    case 'fins': base = finSetMass(part); break;
    case 'mass': {
      const p = part as MassComponent;
      base = { massKg: p.massKg, cgFromNoseM: p.lengthM / 2, IxxAboutCg: 0, ItransAboutCg: 0, L: p.lengthM };
      break;
    }
  }
  return {
    massKg: base.massKg,
    cgFromNoseM: stationFromNoseM + base.cgFromNoseM,
    IxxAboutCg: base.IxxAboutCg,
    ItransAboutCg: base.ItransAboutCg,
  };
};

/** Fore station of each part: nose at 0, tubes/masses stack in order; a fin set
 *  mounts at the aft end of the preceding tube (its own length not added to the stack). */
export const partStations = (design: RocketDesign): number[] => {
  const stations: number[] = [];
  let x = 0;
  let lastTubeAft = 0;
  for (const part of design.parts) {
    if (part.kind === 'fins') {
      // Mount so the fin ROOT trailing edge sits at the aft end of the last tube.
      stations.push(lastTubeAft - part.rootChordM);
      continue;
    }
    stations.push(x);
    const len = part.kind === 'nose' ? part.lengthM : part.kind === 'tube' ? part.lengthM : part.lengthM;
    x += len;
    if (part.kind === 'tube') lastTubeAft = x;
  }
  return stations;
};

export interface DryMass {
  massKg: number;
  cgFromNoseM: number;
  Ixx: number;
  Iyy: number;
  Izz: number;
}

/** Assemble dry mass, CG (from nose), and the inertia tensor about the dry CG. */
export const dryMassProps = (design: RocketDesign): DryMass => {
  const stations = partStations(design);
  const pms = design.parts.map((p, i) => partMass(p, stations[i]));
  const massKg = pms.reduce((s, p) => s + p.massKg, 0);
  const cg = pms.reduce((s, p) => s + p.massKg * p.cgFromNoseM, 0) / massKg;
  let Ixx = 0;
  let Itrans = 0;
  for (const p of pms) {
    const d = p.cgFromNoseM - cg;
    Ixx += p.IxxAboutCg;
    Itrans += p.ItransAboutCg + p.massKg * d * d; // parallel axis to the dry CG
  }
  return { massKg, cgFromNoseM: cg, Ixx, Iyy: Itrans, Izz: Itrans };
};
