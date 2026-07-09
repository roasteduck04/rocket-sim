import { describe, expect, it } from 'vitest';
import { ALPHA_III, barrowman, dryMassProps, staticMarginCal } from '@fds/rocket-design';

describe('barrowman — Alpha III', () => {
  it('gives CNα > 2 (nose + fins) and CP aft of mid-body', () => {
    const b = barrowman(ALPHA_III);
    expect(b.CNalpha).toBeGreaterThan(2); // nose (2) + fin contribution
    expect(b.CNalpha).toBeLessThan(30);
    expect(b.cpFromNoseM).toBeGreaterThan(0.15);
    expect(b.cpFromNoseM).toBeLessThan(0.31);
  });

  it('yields a positive, stable static margin about the dry CG', () => {
    const dm = dryMassProps(ALPHA_III);
    const margin = staticMarginCal(ALPHA_III, dm.cgFromNoseM);
    expect(margin).toBeGreaterThan(0.5); // stable
    expect(margin).toBeLessThan(4);
  });
});
