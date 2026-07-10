import { describe, expect, it } from 'vitest';
import { loadAeroTable, interpAero } from '@fds/rocket-sim';
import { ALPHA_III, aeroTable, DEFAULT_GRID } from '@fds/rocket-design';

describe('aeroTable — Alpha III', () => {
  const { csv, table, cpFromNoseM } = aeroTable(ALPHA_III);

  it('re-parses through the sim loader on a complete grid', () => {
    const reloaded = loadAeroTable(csv);
    expect(reloaded.machGrid).toEqual(DEFAULT_GRID.machGrid);
    expect(reloaded.aoaGrid).toEqual(DEFAULT_GRID.aoaDegGrid);
  });

  it('has CN that grows with AoA and drag on the CA column', () => {
    const at0 = interpAero(table, 0.2, 0);
    const at10 = interpAero(table, 0.2, 10);
    expect(at0.CN).toBeCloseTo(0, 6);
    expect(at10.CN).toBeGreaterThan(0);
    expect(at10.CA).toBeGreaterThan(0.2); // = cd0
    expect(cpFromNoseM).toBeGreaterThan(0.15);
  });
});
