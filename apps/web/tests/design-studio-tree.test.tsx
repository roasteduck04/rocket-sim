import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';
import { designReducer } from '../src/features/design-studio/designModel';
import { ALPHA_III } from '@fds/rocket-design';

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

  it('removing the last selected item does not crash and leaves no undefined holes', () => {
    render(<DesignStudioView />);
    const before = screen.getAllByRole('treeitem');
    const lastLabel = before[before.length - 1].textContent ?? '';
    fireEvent.click(screen.getByText(new RegExp(lastLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    fireEvent.click(screen.getByText('Remove'));

    const after = screen.getAllByRole('treeitem');
    expect(after.length).toBe(before.length - 1);
    // No leftover part rendered "undefined" (the old bug's crash symptom).
    expect(screen.queryByText(/undefined/)).toBeNull();
    // Selection is clamped into the shrunken array, landing on the new last
    // item, so "↓" (nothing to swap with below) must be disabled — this is
    // the case that used to leave a stale out-of-range selectedIndex and let
    // "↑" dispatch movePart with an undefined source part.
    expect((screen.getByText('↓') as HTMLButtonElement).disabled).toBe(true);

    // Clicking "↑" from the clamped (in-range) selection must be a normal,
    // safe move — not a crash — and must not introduce any undefined holes.
    fireEvent.click(screen.getByText('↑'));
    expect(screen.getAllByRole('treeitem').length).toBe(before.length - 1);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('two consecutive move-down clicks move the same item two slots (selection follows)', () => {
    render(<DesignStudioView />);
    fireEvent.click(screen.getByText(/Nose cone/));
    fireEvent.click(screen.getByText('↓'));
    fireEvent.click(screen.getByText('↓'));
    const items = screen.getAllByRole('treeitem');
    expect(items[2].textContent).toMatch(/Nose cone/);
    expect(items[0].textContent).not.toMatch(/Nose cone/);
    expect(items[1].textContent).not.toMatch(/Nose cone/);
  });

  it('movePart reducer is a no-op when the source index is out of range', () => {
    const design = structuredClone(ALPHA_III);
    const tooHigh = designReducer(design, { type: 'movePart', index: 10, dir: 1 });
    const negative = designReducer(design, { type: 'movePart', index: -1, dir: -1 });
    expect(tooHigh).toEqual(design);
    expect(negative).toEqual(design);
    expect(tooHigh.parts.every((p) => p !== undefined)).toBe(true);
  });
});
