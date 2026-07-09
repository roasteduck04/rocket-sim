import { describe, expect, it } from 'vitest';
import { PACKAGE } from '@fds/rocket-design';

describe('rocket-design scaffold', () => {
  it('resolves the workspace package', () => {
    expect(PACKAGE).toBe('@fds/rocket-design');
  });
});
