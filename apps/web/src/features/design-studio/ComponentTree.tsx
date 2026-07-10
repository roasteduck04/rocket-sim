/**
 * Task 11 — component tree editor. Maps the ordered `RocketDesign.parts` to
 * the Phase 8 `Tree` primitive (single-select ARIA tree) and drives the
 * `designReducer` (Task 10) actions through a `Toolbar` of add/reorder/remove
 * controls. Selection is lifted to the parent (`DesignStudioView`) so a later
 * task's inspector panel can read the same `selectedIndex`.
 */

import type { JSX } from 'react';
import type { Part, RocketDesign } from '@fds/rocket-design';
import { Tree, Toolbar, Button } from '../../ui';
import type { DesignAction } from './designModel';

const label = (p: Part): string =>
  p.kind === 'nose'
    ? `Nose cone (${p.shape})`
    : p.kind === 'tube'
      ? 'Body tube'
      : p.kind === 'fins'
        ? `Fin set (${p.count})`
        : `Mass · ${p.label}`;

const NEW_TUBE: Part = {
  kind: 'tube',
  lengthM: 0.1,
  outerRadiusM: 0.0123,
  wallThicknessM: 0.0003,
  material: 'kraft-tube',
};

export function ComponentTree({
  design,
  selectedIndex,
  onSelect,
  dispatch,
}: {
  design: RocketDesign;
  selectedIndex: number;
  onSelect: (i: number) => void;
  dispatch: (a: DesignAction) => void;
}): JSX.Element {
  const nodes = design.parts.map((p, i) => ({ id: String(i), label: label(p) }));
  // A selection index is only meaningful while it points at a live part —
  // after a remove (or before anything is selected) it can be -1 or stale,
  // so every button's enabled state derives from this rather than a bare
  // sign check (finding 1b).
  const hasValidSelection = selectedIndex >= 0 && selectedIndex < design.parts.length;

  const handleMove = (dir: -1 | 1): void => {
    const destination = selectedIndex + dir;
    if (!hasValidSelection || destination < 0 || destination >= design.parts.length) return;
    dispatch({ type: 'movePart', index: selectedIndex, dir });
    // Selection follows the moved part so a second click moves the same
    // item again instead of its now-adjacent neighbour (finding 2).
    onSelect(destination);
  };

  const handleRemove = (): void => {
    if (!hasValidSelection) return;
    const removedIndex = selectedIndex;
    dispatch({ type: 'removePart', index: removedIndex });
    const newLength = design.parts.length - 1;
    // Clamp selection into the post-remove array instead of leaving it
    // pointing past the end, which previously let ↑/↓ dispatch a move with
    // an out-of-range index and corrupt the parts array (finding 1b).
    onSelect(newLength <= 0 ? -1 : Math.min(removedIndex, newLength - 1));
  };

  return (
    <div className="ds-tree">
      <Toolbar aria-label="Component tree actions">
        <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'addPart', part: NEW_TUBE })}>
          + Tube
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasValidSelection || selectedIndex === 0}
          onClick={() => handleMove(-1)}
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasValidSelection || selectedIndex === design.parts.length - 1}
          onClick={() => handleMove(1)}
        >
          ↓
        </Button>
        <Toolbar.Spacer />
        <Button size="sm" variant="danger" disabled={!hasValidSelection} onClick={handleRemove}>
          Remove
        </Button>
      </Toolbar>
      <Tree
        nodes={nodes}
        aria-label="Rocket components"
        selectedId={selectedIndex >= 0 ? String(selectedIndex) : undefined}
        onSelect={(id) => onSelect(Number(id))}
      />
    </div>
  );
}
