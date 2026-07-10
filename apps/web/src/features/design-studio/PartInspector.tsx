/**
 * Task 12 — per-part inspector form. Renders the editable fields for
 * whichever part is selected in the `ComponentTree` (Task 11); every field
 * change dispatches a whole-part `updatePart` action back through the
 * `designReducer` (Task 10). Field kinds branch on `Part['kind']`; `mass`
 * parts have no `material`, so the shared Material select is guarded out for
 * them.
 */

import type { JSX } from 'react';
import type { Part } from '@fds/rocket-design';
import { MATERIALS } from '@fds/rocket-design';
import type { MaterialId } from '@fds/rocket-design';
import { NumberField, Panel, Select } from '../../ui';
import type { DesignAction } from './designModel';

export function PartInspector({
  part,
  index,
  dispatch,
}: {
  part: Part | null;
  index: number;
  dispatch: (a: DesignAction) => void;
}): JSX.Element {
  if (!part) {
    return (
      <Panel title="Part">
        <p>Select a component.</p>
      </Panel>
    );
  }

  const set = <P extends Part>(current: P, patch: Partial<P>): void =>
    dispatch({ type: 'updatePart', index, part: { ...current, ...patch } });

  return (
    <Panel title={part.kind}>
      {part.kind === 'nose' && (
        <>
          <Select
            label="Shape"
            value={part.shape}
            onChange={(v) => set(part, { shape: v })}
            options={[
              { value: 'ogive', label: 'Ogive' },
              { value: 'cone', label: 'Cone' },
            ]}
          />
          <NumberField
            label="Length"
            unit="m"
            value={part.lengthM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { lengthM: v })}
          />
          <NumberField
            label="Base radius"
            unit="m"
            value={part.baseRadiusM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { baseRadiusM: v })}
          />
        </>
      )}
      {part.kind === 'tube' && (
        <>
          <NumberField
            label="Length"
            unit="m"
            value={part.lengthM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { lengthM: v })}
          />
          <NumberField
            label="Outer radius"
            unit="m"
            value={part.outerRadiusM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { outerRadiusM: v })}
          />
        </>
      )}
      {part.kind === 'fins' && (
        <>
          <NumberField
            label="Count"
            value={part.count}
            step={1}
            min={1}
            onChange={(v) => set(part, { count: Math.round(v) })}
          />
          <NumberField
            label="Root chord"
            unit="m"
            value={part.rootChordM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { rootChordM: v })}
          />
          <NumberField
            label="Tip chord"
            unit="m"
            value={part.tipChordM}
            step={0.001}
            min={0}
            onChange={(v) => set(part, { tipChordM: v })}
          />
          <NumberField
            label="Semi-span"
            unit="m"
            value={part.semiSpanM}
            step={0.001}
            min={0.001}
            onChange={(v) => set(part, { semiSpanM: v })}
          />
          <NumberField
            label="Sweep"
            unit="m"
            value={part.sweepM}
            step={0.001}
            onChange={(v) => set(part, { sweepM: v })}
          />
        </>
      )}
      {part.kind !== 'mass' && (
        <Select
          label="Material"
          value={part.material}
          onChange={(v) => set(part, { material: v as MaterialId })}
          options={MATERIALS.map((m) => ({ value: m, label: m }))}
        />
      )}
    </Panel>
  );
}
