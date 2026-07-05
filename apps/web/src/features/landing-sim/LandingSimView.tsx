/**
 * D · Landing (landing-sim spec §5): entry-point setup → cinematic playback.
 * This skeleton mounts the setup panel; Tasks 5–12 fill in the worker, the
 * selector, the canvas, the HUD, and the verdict flow.
 */

import { useState, type JSX } from 'react';
import type { EntryInputs } from './types';

/** UI defaults (SI/radians); the selector edits these (spec §2). */
export const DEFAULT_INPUTS: EntryInputs = {
  altitudeM: 15000,
  speedMps: 400,
  gammaRad: (-70 * Math.PI) / 180,
  downrangeM: 3000,
  propellantKg: 1500,
};

export const LandingSimView = (): JSX.Element => {
  const [inputs] = useState<EntryInputs>(DEFAULT_INPUTS);

  return (
    <div className="landing-layout">
      <div className="panel">
        <h2>Entry point</h2>
        <p className="hint">
          Drag the entry state onto the capture region, set γ and downrange, then launch.
        </p>
        <p>
          {(inputs.altitudeM / 1000).toFixed(1)} km · {inputs.speedMps.toFixed(0)} m/s
        </p>
        <div className="btn-row">
          <button type="button" className="btn" disabled>
            Launch
          </button>
        </div>
      </div>
    </div>
  );
};
