import { describe, expect, it } from 'vitest';
import type { BodyTube } from '@fds/rocket-design';
import { partMass, dryMassProps } from '@fds/rocket-design';
import { ALPHA_III } from '@fds/rocket-design';

describe('partMass — hollow tube', () => {
  const tube: BodyTube = { kind: 'tube', lengthM: 0.2, outerRadiusM: 0.02, wallThicknessM: 0.001, material: 'kraft-tube' };

  it('matches the analytic hollow-cylinder mass and centroid', () => {
    const ro = 0.02, ri = 0.019, L = 0.2, rho = 850;
    const expectedMass = rho * Math.PI * (ro * ro - ri * ri) * L;
    const pm = partMass(tube, 0.05);
    expect(pm.massKg).toBeCloseTo(expectedMass, 6);
    expect(pm.cgFromNoseM).toBeCloseTo(0.05 + L / 2, 6); // centroid at mid-length
  });
});

describe('dryMassProps — Alpha III', () => {
  it('is a light rocket with CG in the aft half', () => {
    const dm = dryMassProps(ALPHA_III);
    expect(dm.massKg).toBeGreaterThan(0.01);
    expect(dm.massKg).toBeLessThan(0.06); // ~34 g airframe
    expect(dm.cgFromNoseM).toBeGreaterThan(0.10);
    expect(dm.cgFromNoseM).toBeLessThan(0.30);
    expect(dm.Iyy).toBeCloseTo(dm.Izz, 12); // axisymmetric
    expect(dm.Iyy).toBeGreaterThan(0);
  });
});
