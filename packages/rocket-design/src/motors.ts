import { loadThrustCurve } from '@fds/rocket-sim';
import type { ThrustCurve } from '@fds/rocket-sim';

export interface Motor {
  id: string;
  designation: string;
  diameterM: number;
  lengthM: number;
  propellantKg: number;
  totalKg: number;
  thrustCurve: ThrustCurve;
  totalImpulseNs: number;
  avgThrustN: number;
  burnTimeS: number;
  impulseClass: string;
}

/** NAR impulse class: A ≤ 2.5, B ≤ 5, C ≤ 10, … each letter doubles. */
export const impulseClassOf = (impulseNs: number): string => {
  if (impulseNs <= 0.3125) return '¼A';
  const letters = 'ABCDEFGHIJKLMNO';
  // Class A upper bound is 2.5 N·s; each subsequent letter doubles.
  let hi = 2.5;
  for (let i = 0; i < letters.length; i++) {
    if (impulseNs <= hi) return letters[i];
    hi *= 2;
  }
  return letters[letters.length - 1];
};

const trapz = (t: number[], f: number[]): number => {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += 0.5 * (f[i] + f[i - 1]) * (t[i] - t[i - 1]);
  return s;
};

export const parseEng = (id: string, text: string): Motor => {
  // Header = the first non-comment, non-blank line whose first token is NON-numeric.
  let header: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (Number.isNaN(Number(parts[0]))) { header = parts; break; }
  }
  if (!header || header.length < 7) throw new Error(`.eng ${id}: missing/short header line`);
  const [designation, diaMm, lenMm, , propKg, totalKg] = header;

  const thrustCurve: ThrustCurve = loadThrustCurve(text);
  const totalImpulseNs = trapz(thrustCurve.time, thrustCurve.thrust);
  const burnTimeS = thrustCurve.time[thrustCurve.time.length - 1];
  return {
    id,
    designation,
    diameterM: Number(diaMm) / 1000,
    lengthM: Number(lenMm) / 1000,
    propellantKg: Number(propKg),
    totalKg: Number(totalKg),
    thrustCurve,
    totalImpulseNs,
    avgThrustN: totalImpulseNs / burnTimeS,
    burnTimeS,
    impulseClass: impulseClassOf(totalImpulseNs),
  };
};
