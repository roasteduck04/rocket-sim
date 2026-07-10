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
  return (
    <div className="ds-tree">
      <Toolbar aria-label="Component tree actions">
        <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'addPart', part: NEW_TUBE })}>
          + Tube
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectedIndex < 0}
          onClick={() => dispatch({ type: 'movePart', index: selectedIndex, dir: -1 })}
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectedIndex < 0}
          onClick={() => dispatch({ type: 'movePart', index: selectedIndex, dir: 1 })}
        >
          ↓
        </Button>
        <Toolbar.Spacer />
        <Button
          size="sm"
          variant="danger"
          disabled={selectedIndex < 0}
          onClick={() => dispatch({ type: 'removePart', index: selectedIndex })}
        >
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
