/**
 * Task 10 wired the nav entry, reducer and localStorage persistence. Task 11
 * adds the component tree editor (left column) on top of that state; the
 * schematic (middle) and inspector/motor-picker (right) columns land in
 * later tasks.
 */

import { useEffect, useReducer, useState, type JSX } from 'react';
import { ComponentTree } from './ComponentTree';
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
    </section>
  );
}
