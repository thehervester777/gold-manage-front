// Cross-platform driver for the single-file build (no `ARTIFACT=1 …` shell syntax, so it runs the same on Windows).
//   npm run build:single
import { build } from 'vite';

process.env.ARTIFACT = '1'; // read by vite.config.ts: inline every asset, no code-splitting
await build({ logLevel: 'warn', build: { outDir: 'dist-artifact', emptyOutDir: true } });
await import('./make-artifact.mjs');
