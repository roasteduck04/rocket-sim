import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';
import { installMemoryLocalStorage } from './localStorageShim';

afterEach(cleanup);

describe('PartInspector', () => {
  beforeEach(() => {
    // A working localStorage (see localStorageShim.ts) plus a clean slate
    // each test, so `DesignStudioView`'s `loadDesign()` always starts from
    // the default ALPHA_III design rather than a previous test's writes.
    installMemoryLocalStorage();
  });

  it('edits the selected part', () => {
    render(<DesignStudioView />);
    fireEvent.click(screen.getByText(/Fin set/));
    const count = screen.getByLabelText('Count') as HTMLInputElement;
    fireEvent.change(count, { target: { value: '4' } });
    fireEvent.blur(count);
    expect(screen.getByText(/Fin set \(4\)/)).toBeTruthy();
  });

  it('shows a placeholder when no part is selected', () => {
    render(<DesignStudioView />);
    expect(screen.getByText('Select a component.')).toBeTruthy();
  });

  it('hides the Material field for mass parts', () => {
    render(<DesignStudioView />);
    fireEvent.click(screen.getByText(/Motor mount hardware/));
    expect(screen.queryByLabelText('Material')).toBeNull();
  });
});
