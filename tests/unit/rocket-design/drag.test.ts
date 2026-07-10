import { describe, expect, it } from 'vitest';
import { ALPHA_III, cd0 } from '@fds/rocket-design';

describe('cd0 — Alpha III subsonic', () => {
  it('is a plausible model-rocket drag coefficient', () => {
    const cd = cd0(ALPHA_III, 0.1);
    expect(cd).toBeGreaterThan(0.2);
    expect(cd).toBeLessThan(0.9);
  });
  it('is finite and positive across the subsonic range', () => {
    for (const m of [0.05, 0.2, 0.5, 0.8]) {
      const cd = cd0(ALPHA_III, m);
      expect(Number.isFinite(cd)).toBe(true);
      expect(cd).toBeGreaterThan(0);
    }
  });
});
