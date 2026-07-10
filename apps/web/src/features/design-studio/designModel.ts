/**
 * Task 10 — editable design state for the Rocket Design Studio (walking
 * skeleton). Owns the `RocketDesign` reducer plus localStorage persistence;
 * later tasks (tree/inspector/schematic/motor-picker/fly-it) build UI on top
 * of this model without touching @fds/rocket-design or @fds/rocket-sim.
 */

import type { Part, RocketDesign } from '@fds/rocket-design';
import { ALPHA_III } from '@fds/rocket-design';

const KEY = 'fds-rocket-design';

export type DesignAction =
  | { type: 'addPart'; part: Part }
  | { type: 'removePart'; index: number }
  | { type: 'movePart'; index: number; dir: -1 | 1 }
  | { type: 'updatePart'; index: number; part: Part }
  | { type: 'setMotor'; motorId: string }
  | { type: 'reset' };

export const designReducer = (state: RocketDesign, action: DesignAction): RocketDesign => {
  switch (action.type) {
    case 'addPart':
      return { ...state, parts: [...state.parts, action.part] };
    case 'removePart':
      return { ...state, parts: state.parts.filter((_, i) => i !== action.index) };
    case 'movePart': {
      const j = action.index + action.dir;
      if (j < 0 || j >= state.parts.length) return state;
      const parts = state.parts.slice();
      [parts[action.index], parts[j]] = [parts[j], parts[action.index]];
      return { ...state, parts };
    }
    case 'updatePart':
      return { ...state, parts: state.parts.map((p, i) => (i === action.index ? action.part : p)) };
    case 'setMotor':
      return { ...state, motorId: action.motorId };
    case 'reset':
      return structuredClone(ALPHA_III);
  }
};

export const loadDesign = (): RocketDesign => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RocketDesign;
  } catch {
    /* ignore corrupt/absent storage */
  }
  return structuredClone(ALPHA_III);
};

export const saveDesign = (d: RocketDesign): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage disabled — non-fatal */
  }
};
