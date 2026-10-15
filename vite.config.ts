import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `ARTIFACT=1 npm run build:fast` produces one self-contained bundle (no code-splitting)
// that scripts/make-artifact.mjs then folds into a single HTML page.
const artifact = process.env.ARTIFACT === '1';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: artifact ? 100_000_000 : 4096,
    cssCodeSplit: !artifact,
    chunkSizeWarningLimit: artifact ? 2600 : 1600,
    rolldownOptions: artifact
      ? { output: { codeSplitting: false } }
      : undefined,
  },
});
