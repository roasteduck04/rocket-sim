/**
 * Local types for the D · Landing module (landing-sim spec §5). Worker message
 * types live in lib/simWorker.ts with the other module protocols.
 */

export type PhaseLabel = 'FREEFALL' | 'ENTRY BURN' | 'LANDING BURN' | 'TOUCHDOWN';

export type VerdictKind =
  | 'success'
  | 'hard-landing'
  | 'tip-over'
  | 'missed-pad'
  | 'out-of-propellant'
  | 'rud'
  | 'no-touchdown';

export interface Verdict {
  kind: VerdictKind;
  /** One-line human description for the banner. */
  detail: string;
}

/** The four user-settable entry inputs + the fixed propellant load (spec §2). */
export interface EntryInputs {
  altitudeM: number;
  speedMps: number;
  gammaRad: number;
  downrangeM: number;
  propellantKg: number;
}

export type CaptureOutcome = 'lands' | 'misses' | 'crashes';

/** Streaming capture-region grid; cells[iH][iV], null = not yet computed. */
export interface CaptureGrid {
  nV: number;
  nH: number;
  vRange: [number, number];
  hRange: [number, number];
  cells: (CaptureOutcome | null)[][];
  /** True while a fresh sweep streams in (rendered greyed). */
  stale: boolean;
}

/** Phase timestamps returned by the worker with a finished run. */
export interface PhaseTimes {
  entryBurnIgnitionTime: number | null;
  entryBurnCutoffTime: number | null;
  landingIgnitionTime: number | null;
}
