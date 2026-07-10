import { atmosphere } from '@fds/atmosphere-models';
import type { FinSet, RocketDesign } from './components.js';
import { barrowman } from './barrowman.js';

const bodyLengthM = (design: RocketDesign): number =>
  design.parts.reduce((s, p) => s + (p.kind === 'nose' || p.kind === 'tube' ? p.lengthM : 0), 0);

const wettedBodyAreaM2 = (design: RocketDesign, R: number): number => {
  let a = 0;
  for (const p of design.parts) {
    if (p.kind === 'tube') a += 2 * Math.PI * p.outerRadiusM * p.lengthM;
    if (p.kind === 'nose') a += Math.PI * p.baseRadiusM * Math.hypot(p.baseRadiusM, p.lengthM);
  }
  return a || 2 * Math.PI * R * bodyLengthM(design);
};

/** Zero-lift drag coefficient referenced to the body cross-section area. */
export const cd0 = (design: RocketDesign, mach: number, altitudeM = 0): number => {
  const b = barrowman(design);
  const R = b.refRadiusM;
  const Aref = b.refAreaM2;
  const L = Math.max(bodyLengthM(design), 1e-3);
  const atmo = atmosphere(altitudeM);
  const V = Math.max(mach * atmo.a, 1); // avoid Re→0 at rest
  const nu = 1.5e-5; // kinematic viscosity of air, m²/s (sea-level ballpark)
  const Re = Math.max((V * L) / nu, 1e4);
  const Cf = 0.074 * Re ** -0.2; // turbulent flat-plate

  const Awet = wettedBodyAreaM2(design, R);
  const friction = Cf * (Awet / Aref);

  // Base drag: the blunt tail behind the body, plus interference drag (fin-body
  // junctions, launch lug) not separately modeled. A subsonic model-rocket CD0 is
  // typically ~0.45–0.6 all-in; the friction + fin terms above already cover
  // several tenths of that, so a `base` of ~0.12–0.2 is a physically defensible
  // slice of the remainder for a smooth, blunt-based BT-50 airframe.
  const base = 0.2; // realistic upper bound; ≈ 0.2·(A_base/A_ref), A_base ≈ A_ref for a straight tube

  // Fin profile drag (thin plates), referenced to A_ref.
  const fins = design.parts.find((p): p is FinSet => p.kind === 'fins');
  let finDrag = 0;
  if (fins) {
    const planform = 0.5 * (fins.rootChordM + fins.tipChordM) * fins.semiSpanM * fins.count;
    finDrag = 2 * Cf * (planform / Aref); // two wetted sides
  }
  return friction + base + finDrag;
};
