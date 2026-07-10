import { beforeEach, describe, expect, it } from 'vitest';
import { ALPHA_III } from '@fds/rocket-design';
import { designReducer, loadDesign } from '../src/features/design-studio/designModel';
import { installMemoryLocalStorage } from './localStorageShim';

const KEY = 'fds-rocket-design';

// ALPHA_III's parts are [nose, mass, tube, fins, mass] (Task 9's mass-model
// calibration inserted the two `mass` hardware components), not the bare
// [nose, tube, fins] shell — assertions below reflect that 5-part fixture.
describe('designReducer', () => {
  it('reorders parts', () => {
    const moved = designReducer(ALPHA_III, { type: 'movePart', index: 0, dir: 1 });
    expect(moved.parts[0].kind).toBe('mass');
    expect(moved.parts[1].kind).toBe('nose');
  });
  it('sets the motor', () => {
    const d = designReducer(ALPHA_III, { type: 'setMotor', motorId: 'Estes_B6' });
    expect(d.motorId).toBe('Estes_B6');
  });
  it('removes a part', () => {
    const d = designReducer(ALPHA_III, { type: 'removePart', index: 2 });
    expect(d.parts).toHaveLength(4);
  });
});

describe('loadDesign', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('falls back to the default design when localStorage holds a corrupt value', () => {
    localStorage.setItem(KEY, 'not json{{{');
    expect(loadDesign()).toEqual(ALPHA_III);
  });

  it('falls back to the default design when the stored value has no parts array', () => {
    localStorage.setItem(KEY, JSON.stringify({ name: 'not a design' }));
    expect(loadDesign()).toEqual(ALPHA_III);
  });

  it('loads a well-formed stored design', () => {
    const stored = { ...ALPHA_III, name: 'Custom' };
    localStorage.setItem(KEY, JSON.stringify(stored));
    expect(loadDesign()).toEqual(stored);
  });
});
