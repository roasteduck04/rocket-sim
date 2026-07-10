/**
 * Task 10 wired the nav entry, reducer and localStorage persistence. Task 11
 * adds the component tree editor (left column) on top of that state. Task 12
 * adds the per-part inspector form (right column). Task 13 adds the live
 * side-view schematic (middle column). Task 14 adds the motor picker and a
 * design summary strip (length, dry mass, CG, CP, static margin) to the
 * right column.
 */

import { useEffect, useReducer, useState, type JSX } from 'react';
import { barrowman, dryMassProps, partStations, staticMarginCal } from '@fds/rocket-design';
import { Stat } from '../../ui';
import { ComponentTree } from './ComponentTree';
import { MotorPicker } from './MotorPicker';
import { PartInspector } from './PartInspector';
import { Schematic } from './Schematic';
import { designReducer, loadDesign, saveDesign } from './designModel';
import './design-studio.css';

export function DesignStudioView(): JSX.Element {
  const [design, dispatch] = useReducer(designReducer, undefined, loadDesign);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    saveDesign(design);
  }, [design]);

  // Guard against the empty design: `barrowman`/`dryMassProps`/
  // `staticMarginCal` assume at least one part (see Schematic's own
  // empty-state guard for the established pattern), so skip the summary
  // strip entirely rather than render NaN/Infinity stats.
  const hasParts = design.parts.length > 0;
  let lengthM = 0;
  let dm: ReturnType<typeof dryMassProps> | null = null;
  let cpFromNoseM = 0;
  let margin = 0;
  if (hasParts) {
    const stations = partStations(design);
    lengthM = Math.max(
      ...design.parts.map((p, i) =>
        stations[i] + (p.kind === 'fins' ? p.rootChordM : p.kind === 'mass' ? 0 : p.lengthM),
      ),
      1e-3,
    );
    dm = dryMassProps(design);
    cpFromNoseM = barrowman(design).cpFromNoseM;
    margin = staticMarginCal(design, dm.cgFromNoseM);
  }

  return (
    <section className="design-studio">
      <h1 className="ds-header">Design Studio</h1>
      <ComponentTree
        design={design}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        dispatch={dispatch}
      />
      <Schematic design={design} />
      <div className="ds-inspector">
        <PartInspector part={design.parts[selectedIndex] ?? null} index={selectedIndex} dispatch={dispatch} />
        <MotorPicker design={design} dispatch={dispatch} />
        {hasParts && dm ? (
          <div className="ds-summary">
            <Stat label="Length" value={lengthM.toFixed(3)} unit="m" />
            <Stat label="Dry mass" value={dm.massKg.toFixed(3)} unit="kg" />
            {/* Labelled "CG from nose"/"CP from nose" (not bare "CG"/"CP") so
                this Stat's text doesn't collide with the Schematic SVG's own
                "CG"/"CP" tick labels (see design-studio-schematic.test.tsx,
                which asserts exactly one "CP"/"CG" text node). */}
            <Stat label="CG from nose" value={dm.cgFromNoseM.toFixed(3)} unit="m" />
            <Stat label="CP from nose" value={cpFromNoseM.toFixed(3)} unit="m" />
            <Stat label="Static margin" value={margin.toFixed(2)} unit="cal" />
          </div>
        ) : (
          <p className="ds-margin">Add components to see the design summary.</p>
        )}
      </div>
    </section>
  );
}
