import type { MaterialId } from './materials.js';

export interface NoseCone {
  kind: 'nose';
  shape: 'ogive' | 'cone';
  lengthM: number;
  baseRadiusM: number;
  wallThicknessM: number;
  material: MaterialId;
}
export interface BodyTube {
  kind: 'tube';
  lengthM: number;
  outerRadiusM: number;
  wallThicknessM: number;
  material: MaterialId;
}
export interface FinSet {
  kind: 'fins';
  count: number;
  rootChordM: number;
  tipChordM: number;
  semiSpanM: number;
  /** Axial distance from the root leading edge to the tip leading edge, m. */
  sweepM: number;
  thicknessM: number;
  material: MaterialId;
}
export interface MassComponent {
  kind: 'mass';
  label: string;
  massKg: number;
  lengthM: number;
}
export type Part = NoseCone | BodyTube | FinSet | MassComponent;

export interface RocketDesign {
  name: string;
  /** Ordered nose → tail. The fin set is mounted at the aft end of the tube it follows. */
  parts: Part[];
  /** Selected curated motor id (Task 4), e.g. 'Estes_C6'. */
  motorId: string;
}

/**
 * Estes Alpha III — the canonical OpenRocket tutorial rocket (BT-50 airframe).
 *
 * The 3-part nose/tube/fins geometry alone models only the airframe shell (~15.6 g
 * at a realistic ~0.3 mm kraft-tube wall), far under the real Alpha III's ~34 g
 * loaded-empty mass. The gap is internal hardware the geometric shell doesn't
 * otherwise represent: nose weight, recovery wadding, parachute and shock cord
 * bundled in the upper body tube, plus the motor mount tube, centering rings,
 * engine hook and launch lug clustered near the aft end.
 *
 * Rather than smear that mass uniformly into an unrealistically thick tube wall
 * (a bare BT-50 kraft tube wall is ~0.3–0.8 mm, not several mm), it's modeled as
 * two located `mass` parts: a forward one (recovery gear, in the upper tube just
 * aft of the nose shoulder) and an aft one (motor-mount hardware, at the tube's
 * aft end). `partStations` (see massModel.ts) stacks non-fin parts by summing
 * `lengthM` in array order, so the forward mass part's own `lengthM` is carved
 * out of the body tube's `lengthM` (0.243 m total minus the forward mass's
 * 0.03 m) to keep the tube's aft end — and therefore the fin mount station and
 * the Barrowman CP, which only reads the nose and fin stations — exactly where
 * the unmodified 3-part geometry put it. The aft mass part is appended after the
 * tube (and thus doesn't shift anything downstream, since only `tube` parts
 * advance the fin-mount reference `lastTubeAft`). Net result: dry mass ≈ 34 g,
 * dry CG ≈ 0.188 m from the nose — matching the real kit and OpenRocket's
 * ~0.187 m loaded CG — with CP unchanged from the shell-only geometry.
 */
export const ALPHA_III: RocketDesign = {
  name: 'Estes Alpha III',
  parts: [
    { kind: 'nose', shape: 'ogive', lengthM: 0.064, baseRadiusM: 0.0123, wallThicknessM: 0.0015, material: 'plastic' },
    { kind: 'mass', label: 'Recovery hardware (wadding, parachute, shock cord)', massKg: 0.0115, lengthM: 0.03 },
    { kind: 'tube', lengthM: 0.213, outerRadiusM: 0.0123, wallThicknessM: 0.0003, material: 'kraft-tube' },
    { kind: 'fins', count: 3, rootChordM: 0.048, tipChordM: 0.025, semiSpanM: 0.028, sweepM: 0.030, thicknessM: 0.0025, material: 'plastic' },
    { kind: 'mass', label: 'Motor mount hardware (engine hook, centering rings, launch lug)', massKg: 0.0075, lengthM: 0.02 },
  ],
  motorId: 'Estes_C6',
};
