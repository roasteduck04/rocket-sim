import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

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
});
