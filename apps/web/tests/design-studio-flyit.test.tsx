import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ALPHA_III } from '@fds/rocket-design';
import { installMemoryLocalStorage } from './localStorageShim';
import { fly } from '../src/features/design-studio/flyIt';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

afterEach(cleanup);

describe('fly', () => {
  it('returns a positive apogee and a rising altitude series', () => {
    const r = fly(ALPHA_III);
    expect(r.apogeeM).toBeGreaterThan(10);
    expect(r.series.length).toBeGreaterThan(2);
    expect(r.series[r.series.length - 1].altitudeM).toBeGreaterThan(r.series[0].altitudeM);
  });
});

describe('DesignStudioView — Fly it', () => {
  it('enables "Fly it" for the default (non-empty) design and shows results on click', () => {
    installMemoryLocalStorage();
    render(<DesignStudioView />);
    const btn = screen.getByRole('button', { name: 'Fly it' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(screen.getByText('Apogee')).toBeTruthy();
    expect(screen.getByText('Max Mach')).toBeTruthy();
  });

  it('disables "Fly it" once every part is removed', () => {
    const storage = installMemoryLocalStorage();
    // Seed an empty design directly so the test doesn't depend on the tree
    // editor's own remove-all-parts UI flow — this exercises the same
    // `loadDesign()` path the app uses on mount.
    storage.setItem('fds-rocket-design', JSON.stringify({ name: 'Empty', parts: [], motorId: 'Estes_C6' }));
    render(<DesignStudioView />);
    const btn = screen.getByRole('button', { name: 'Fly it' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('clears the previous flight result when the design changes', () => {
    installMemoryLocalStorage();
    render(<DesignStudioView />);
    const btn = screen.getByRole('button', { name: 'Fly it' });
    fireEvent.click(btn);
    expect(screen.getByText('Apogee')).toBeTruthy();

    // Switching motor dispatches a `setMotor` action, changing `design` —
    // the stale flight result must disappear rather than linger stale.
    const motorSelect = screen.getByLabelText('Motor') as HTMLSelectElement;
    fireEvent.change(motorSelect, { target: { value: 'Estes_B6' } });
    expect(screen.queryByText('Apogee')).toBeNull();
  });
});
