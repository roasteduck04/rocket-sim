/**
 * Task 12 — per-part inspector form. Renders the editable fields for
 * whichever part is selected in the `ComponentTree` (Task 11); every field
 * change dispatches a whole-part `updatePart` action back through the
 * `designReducer` (Task 10). Field kinds branch on `Part['kind']`; `mass`
 * parts have no `material`, so the shared Material select is guarded out for
 * them.
 */

import type { JSX } from 'react';
import type { BodyTube, FinSet, MassComponent, NoseCone, Part } from '@fds/rocket-design';
import { MATERIALS } from '@fds/rocket-design';
import type { MaterialId } from '@fds/rocket-design';
import { NumberField, Panel, Select } from '../../ui';
import type { DesignAction } from './designModel';

// `keyof (A | B | ...)` only yields keys common to every union member, so a
// single `Partial<Part>` can't express "a patch of whichever variant is
// selected". Union the per-variant partials instead — the final `as Part`
// cast in `set` still asserts the merged shape back down to `Part`.
type PartPatch = Partial<NoseCone> | Partial<BodyTube> | Partial<FinSet> | Partial<MassComponent>;

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

  const set = (patch: PartPatch): void =>
    dispatch({ type: 'updatePart', index, part: { ...part, ...patch } as Part });

  return (
    <Panel title={part.kind}>
      {part.kind === 'nose' && (
        <>
          <Select
            label="Shape"
            value={part.shape}
            onChange={(v) => set({ shape: v })}
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
            onChange={(v) => set({ lengthM: v })}
          />
          <NumberField
            label="Base radius"
            unit="m"
            value={part.baseRadiusM}
            step={0.001}
            min={0.001}
            onChange={(v) => set({ baseRadiusM: v })}
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
            onChange={(v) => set({ lengthM: v })}
          />
          <NumberField
            label="Outer radius"
            unit="m"
            value={part.outerRadiusM}
            step={0.001}
            min={0.001}
            onChange={(v) => set({ outerRadiusM: v })}
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
            onChange={(v) => set({ count: Math.round(v) })}
          />
          <NumberField
            label="Root chord"
            unit="m"
            value={part.rootChordM}
            step={0.001}
            min={0.001}
            onChange={(v) => set({ rootChordM: v })}
          />
          <NumberField
            label="Tip chord"
            unit="m"
            value={part.tipChordM}
            step={0.001}
            min={0}
            onChange={(v) => set({ tipChordM: v })}
          />
          <NumberField
            label="Semi-span"
            unit="m"
            value={part.semiSpanM}
            step={0.001}
            min={0.001}
            onChange={(v) => set({ semiSpanM: v })}
          />
          <NumberField label="Sweep" unit="m" value={part.sweepM} step={0.001} onChange={(v) => set({ sweepM: v })} />
        </>
      )}
      {part.kind !== 'mass' && (
        <Select
          label="Material"
          value={part.material}
          onChange={(v) => set({ material: v as MaterialId })}
          options={MATERIALS.map((m) => ({ value: m, label: m }))}
        />
      )}
    </Panel>
  );
}
