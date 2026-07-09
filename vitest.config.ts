import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Aliases let the test suite resolve workspace packages straight from their
// TypeScript source, so `vitest` runs the exact code that ships (no build step,
// no divergence between "what was tested" and "what ships" — README §7).
export default defineConfig({
  resolve: {
    alias: {
      '@fds/physics-core': r('./packages/physics-core/src/index.ts'),
      '@fds/atmosphere-models': r('./packages/atmosphere-models/src/index.ts'),
      '@fds/aircraft-sim': r('./packages/aircraft-sim/src/index.ts'),
      '@fds/rocket-sim': r('./packages/rocket-sim/src/index.ts'),
      '@fds/reentry-sim': r('./packages/reentry-sim/src/index.ts'),
      '@fds/rocket-design': r('./packages/rocket-design/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
