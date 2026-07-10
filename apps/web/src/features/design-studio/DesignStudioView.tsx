/**
 * Task 10 wired the nav entry, reducer and localStorage persistence. Task 11
 * adds the component tree editor (left column) on top of that state. Task 12
 * adds the per-part inspector form (right column). Task 13 adds the live
 * side-view schematic (middle column). Task 14 adds the motor picker and a
 * design summary strip (length, dry mass, CG, CP, static margin) to the
 * right column. Task 15 adds the "Fly it" action + results (apogee/max-Mach/
 * max-g stats and an altitude/speed-vs-time chart) under the schematic,
 * running the EXISTING, unmodified @fds/rocket-sim 6-DOF sim on the design.
 */

import { useEffect, useReducer, useState, type JSX } from 'react';
import { barrowman, dryMassProps, partStations, staticMarginCal } from '@fds/rocket-design';
import { Button, Stat } from '../../ui';
import { TimeChart } from '../../lib/charts';
import { SERIES } from '../../lib/palette';
import { ComponentTree } from './ComponentTree';
import { MotorPicker } from './MotorPicker';
import { PartInspector } from './PartInspector';
import { Schematic } from './Schematic';
import { designReducer, loadDesign, saveDesign } from './designModel';
import { fly, type FlightResult } from './flyIt';
import './design-studio.css';

export function DesignStudioView(): JSX.Element {
  const [design, dispatch] = useReducer(designReducer, undefined, loadDesign);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [flight, setFlight] = useState<FlightResult | null>(null);
  const [flightError, setFlightError] = useState<string | null>(null);

  useEffect(() => {
    saveDesign(design);
  }, [design]);

  // A flown result reflects the design at the moment "Fly it" was clicked;
  // once the user edits the design again the old result no longer matches
  // it, so clear it here rather than let a stale chart linger.
  useEffect(() => {
    setFlight(null);
    setFlightError(null);
  }, [design]);

  // A design the user has stripped of its nose/fins (but not all parts —
  // that case is blocked by the `hasParts` guard on the button below) may
  // fly wildly unstably, but must never crash the UI: the sim run is wrapped
  // so any unexpected throw surfaces as a friendly message instead.
  const handleFly = (): void => {
    try {
      setFlightError(null);
      setFlight(fly(design));
    } catch (err) {
      setFlight(null);
      setFlightError(err instanceof Error ? err.message : 'Flight simulation failed.');
    }
  };

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
      <div className="ds-flight">
        <Button variant="primary" onClick={handleFly} disabled={!hasParts}>
          Fly it
        </Button>
        {flightError && (
          <p className="ds-margin" style={{ color: 'var(--fd-warning)' }}>
            {flightError}
          </p>
        )}
        {flight && (
          <>
            <div className="ds-summary">
              <Stat label="Apogee" value={flight.apogeeM.toFixed(1)} unit="m" />
              <Stat label="Apogee time" value={flight.apogeeTimeS.toFixed(1)} unit="s" />
              <Stat label="Max Mach" value={flight.maxMach.toFixed(2)} />
              <Stat label="Max axial g" value={flight.maxAxialG.toFixed(1)} unit="g" />
            </div>
            <div className="chart-grid">
              <TimeChart
                title="Altitude"
                unit="m"
                data={flight.series}
                series={[{ key: 'altitudeM', label: 'altitude', color: SERIES.blue }]}
              />
              <TimeChart
                title="Speed"
                unit="m/s"
                data={flight.series}
                series={[{ key: 'speedMps', label: 'speed', color: SERIES.aqua }]}
              />
            </div>
          </>
        )}
      </div>
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
