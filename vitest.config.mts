import { defineConfig } from 'vitest/config';
import path from 'node:path';

const here = import.meta.dirname;

/**
 * Vitest covers the pure-TypeScript engine layer only: scheduling (FSRS/Elo/BKT),
 * the session composer, scoring, and content validation. Those modules are
 * deliberately free of React Native imports so they can run in plain Node — see
 * docs/ARCHITECTURE.md ("Engine/UI split").
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@content': path.resolve(here, 'content'),
    },
  },
});
