import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RocketDesign } from '@fds/rocket-design';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';
import { Schematic } from '../src/features/design-studio/Schematic';

// `loadDesign`/`saveDesign` (Task 10) fall back to a fresh ALPHA_III clone
// when `localStorage` is unavailable — true in this jsdom test environment —
// so no shim is needed here (mirrors design-studio-tree.test.tsx).
afterEach(cleanup);

describe('Schematic', () => {
  it('renders CP/CG and a numeric static margin', () => {
    render(<DesignStudioView />);
    expect(screen.getByText('CP')).toBeTruthy();
    expect(screen.getByText('CG')).toBeTruthy();
    expect(screen.getByText(/Static margin: .* cal/)).toBeTruthy();
  });

  it('shows an empty-state message instead of NaN when the design has no parts', () => {
    const emptyDesign: RocketDesign = { name: 'Empty', parts: [], motorId: 'Estes_C6' };
    render(<Schematic design={emptyDesign} />);
    expect(screen.getByText('Add components to see the schematic.')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
