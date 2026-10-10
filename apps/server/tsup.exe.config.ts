import { defineConfig } from 'tsup';

// Single CommonJS file with every dependency inlined, as input for the Node single-executable build.
export default defineConfig({
  entry: { launcher: 'src/launcher.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist-exe',
  clean: true,
  noExternal: [/.*/],
});
