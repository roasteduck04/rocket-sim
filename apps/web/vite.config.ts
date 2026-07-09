import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Same source-alias scheme as the root vitest.config.ts: the app bundles the
// workspace packages straight from their TypeScript source, so the browser runs
// the exact code the test suite validated (README §7 — zero divergence between
// "what was tested" and "what ships").
const fdsAliases = {
  '@fds/physics-core': r('../../packages/physics-core/src/index.ts'),
  '@fds/atmosphere-models': r('../../packages/atmosphere-models/src/index.ts'),
  '@fds/aircraft-sim': r('../../packages/aircraft-sim/src/index.ts'),
  '@fds/rocket-sim': r('../../packages/rocket-sim/src/index.ts'),
  '@fds/reentry-sim': r('../../packages/reentry-sim/src/index.ts'),
  '@fds/rocket-design': r('../../packages/rocket-design/src/index.ts'),
};

export default defineConfig(({ command }) => ({
  // On GitHub Pages the app is served from https://<user>.github.io/rocket-sim/,
  // so production assets must resolve under that sub-path. Local dev/preview and
  // the vitest run stay at the root.
  base: command === 'build' ? '/rocket-sim/' : '/',
  plugins: [react()],
  resolve: { alias: fdsAliases },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: false,
  },
}));
