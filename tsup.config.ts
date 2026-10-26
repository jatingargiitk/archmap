import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts', 'src/action.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'node20',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'node20',
  },
]);
