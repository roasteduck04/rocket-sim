/**
 * Task 10 wired the nav entry, reducer and localStorage persistence. Task 11
 * adds the component tree editor (left column) on top of that state. Task 12
 * adds the per-part inspector form (right column); the schematic (middle
 * column) and motor-picker land in later tasks.
 */

import { useEffect, useReducer, useState, type JSX } from 'react';
import { ComponentTree } from './ComponentTree';
import { PartInspector } from './PartInspector';
import { designReducer, loadDesign, saveDesign } from './designModel';
import './design-studio.css';

export function DesignStudioView(): JSX.Element {
  const [design, dispatch] = useReducer(designReducer, undefined, loadDesign);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    saveDesign(design);
  }, [design]);

  return (
    <section className="design-studio">
      <h1 className="ds-header">Design Studio</h1>
      <ComponentTree
        design={design}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        dispatch={dispatch}
      />
      <div className="ds-inspector">
        <PartInspector part={design.parts[selectedIndex] ?? null} index={selectedIndex} dispatch={dispatch} />
      </div>
    </section>
  );
}
