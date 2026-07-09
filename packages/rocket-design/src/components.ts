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

/** Estes Alpha III — the canonical OpenRocket tutorial rocket (BT-50 airframe). */
export const ALPHA_III: RocketDesign = {
  name: 'Estes Alpha III',
  parts: [
    { kind: 'nose', shape: 'ogive', lengthM: 0.064, baseRadiusM: 0.0123, wallThicknessM: 0.0015, material: 'plastic' },
    { kind: 'tube', lengthM: 0.243, outerRadiusM: 0.0123, wallThicknessM: 0.0003, material: 'kraft-tube' },
    { kind: 'fins', count: 3, rootChordM: 0.048, tipChordM: 0.025, semiSpanM: 0.028, sweepM: 0.030, thicknessM: 0.0025, material: 'plastic' },
  ],
  motorId: 'Estes_C6',
};
