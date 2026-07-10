import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';

// `loadDesign`/`saveDesign` (Task 10) wrap `localStorage` access in try/catch and
// silently fall back to a fresh ALPHA_III clone when storage is unavailable —
// true in this jsdom test environment — so each mount below starts from the
// same 5-part preset with no cross-test persistence to clean up.
afterEach(cleanup);

describe('ComponentTree', () => {
  it('adds a part via the toolbar', () => {
    render(<DesignStudioView />);
    const before = screen.getAllByText(/Body tube/).length;
    fireEvent.click(screen.getByText('+ Tube'));
    expect(screen.getAllByText(/Body tube/).length).toBe(before + 1);
  });

  it('selects a node and removes it via the toolbar', () => {
    render(<DesignStudioView />);
    const before = screen.getAllByRole('treeitem').length;
    fireEvent.click(screen.getByText(/Nose cone/));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getAllByRole('treeitem').length).toBe(before - 1);
    expect(screen.queryByText(/Nose cone/)).toBeNull();
  });

  it('reorders the selected part with the move buttons', () => {
    render(<DesignStudioView />);
    fireEvent.click(screen.getByText(/Nose cone/));
    fireEvent.click(screen.getByText('↓'));
    const items = screen.getAllByRole('treeitem');
    expect(items[0].textContent).toMatch(/Mass/);
    expect(items[1].textContent).toMatch(/Nose cone/);
  });
});
