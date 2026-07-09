import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEng, impulseClassOf } from '@fds/rocket-design';

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../data/motors/${name}`, import.meta.url)), 'utf8');

describe('parseEng — Estes C6', () => {
  const motor = parseEng('Estes_C6', read('Estes_C6.eng'));

  it('reads the header metadata', () => {
    expect(motor.designation).toBe('C6');
    expect(motor.diameterM).toBeCloseTo(0.018, 6);
    expect(motor.propellantKg).toBeCloseTo(0.0108, 6);
    expect(motor.totalKg).toBeCloseTo(0.0242, 6);
  });

  it('has a C-class total impulse (~10 N·s) and a burn ~2 s', () => {
    expect(motor.totalImpulseNs).toBeGreaterThan(8);
    expect(motor.totalImpulseNs).toBeLessThan(12);
    expect(motor.impulseClass).toBe('C');
    expect(motor.burnTimeS).toBeCloseTo(2.0, 1);
  });
});

describe('impulseClassOf', () => {
  it('maps impulse to NAR letters', () => {
    expect(impulseClassOf(2.4)).toBe('A');
    expect(impulseClassOf(4.9)).toBe('B');
    expect(impulseClassOf(9.9)).toBe('C');
  });
});
