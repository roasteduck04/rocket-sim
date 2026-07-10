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
 * The 3-part nose/tube/fins geometry alone models only the airframe shell (~15.6 g),
 * far under the real Alpha III's ~34 g loaded-empty mass. The gap is internal hardware
 * the geometric model doesn't otherwise represent: nose weight, motor mount tube,
 * launch lug, recovery wadding, and shock cord — none of which get their own `Part`,
 * since the body tube's own centroid (~0.1855 m from the nose, forward-of-mid-body)
 * already sits close to where that hardware actually lives. Rather than add a fourth
 * `mass` part (which would change `ALPHA_III.parts`'s nose/tube/fins shape), the tube
 * wall is thickened well past a bare kraft tube's ~0.3 mm to lump that ~18 g of internal
 * mass into the tube at its own CG. Because the tube's centroid doesn't depend on its
 * wall thickness, this only shifts the rocket's overall CG forward (toward 0.1855 m,
 * away from the aft-heavy fins) — raising the static margin toward the real rocket's,
 * the same direction a literal forward-mounted mass component would push it. Loading
 * the *aft* end instead (e.g. bulking up the fins) would push the CG aft and lower the
 * margin.
 */
export const ALPHA_III: RocketDesign = {
  name: 'Estes Alpha III',
  parts: [
    { kind: 'nose', shape: 'ogive', lengthM: 0.064, baseRadiusM: 0.0123, wallThicknessM: 0.0015, material: 'plastic' },
    { kind: 'tube', lengthM: 0.243, outerRadiusM: 0.0123, wallThicknessM: 0.0028, material: 'kraft-tube' },
    { kind: 'fins', count: 3, rootChordM: 0.048, tipChordM: 0.025, semiSpanM: 0.028, sweepM: 0.030, thicknessM: 0.0025, material: 'plastic' },
  ],
  motorId: 'Estes_C6',
};
