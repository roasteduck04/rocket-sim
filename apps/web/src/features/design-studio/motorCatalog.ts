/**
 * Task 14 — motor catalog. The web app can't read `data/motors` at runtime,
 * so Vite's `?raw` import bundles the three `.eng` text files at build time;
 * `parseEng` (from `@fds/rocket-design`) turns each into a `Motor`.
 */

import { parseEng } from '@fds/rocket-design';
import type { Motor } from '@fds/rocket-design';
import a8 from '../../../../../data/motors/Estes_A8.eng?raw';
import b6 from '../../../../../data/motors/Estes_B6.eng?raw';
import c6 from '../../../../../data/motors/Estes_C6.eng?raw';

export const MOTORS: Record<string, Motor> = {
  Estes_A8: parseEng('Estes_A8', a8),
  Estes_B6: parseEng('Estes_B6', b6),
  Estes_C6: parseEng('Estes_C6', c6),
};

export const MOTOR_IDS: string[] = Object.keys(MOTORS);
