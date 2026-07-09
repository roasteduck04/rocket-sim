import { describe, expect, it } from 'vitest';
import { ALPHA_III, density, MATERIALS } from '@fds/rocket-design';

describe('materials', () => {
  it('returns known densities', () => {
    expect(density('balsa')).toBeGreaterThan(100);
    expect(density('plastic')).toBeGreaterThan(density('balsa'));
    expect(MATERIALS).toContain('kraft-tube');
  });
});

describe('Alpha III preset', () => {
  it('is a nose + tube + 3-fin stack on a C motor', () => {
    const kinds = ALPHA_III.parts.map((p) => p.kind);
    expect(kinds).toEqual(['nose', 'tube', 'fins']);
    const fins = ALPHA_III.parts.find((p) => p.kind === 'fins');
    expect(fins?.kind === 'fins' && fins.count).toBe(3);
    expect(ALPHA_III.motorId).toBe('Estes_C6');
  });
});
