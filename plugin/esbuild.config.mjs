import { build, context } from 'esbuild';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { patchManifestForPort, touchManifest } from './scripts/patch-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to touch (and optionally patch) manifest.json on build
const touchManifestPlugin = {
  name: 'touch-manifest',
  setup(build) {
    build.onEnd(() => {
      patchManifestForPort();
      // Touch the file by updating its modification time
      touchManifest();
    });
  },
};

// Get command line arguments (npm passes extra args after --)
const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isMinify = args.includes('--minify');

const buildOptions = {
  entryPoints: ['main/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  platform: 'browser',
  // Same floor as vite/optimizeDeps (es2017): the Figma sandbox is the
  // lowest common runtime, and one target means one syntax level to debug.
  target: 'es2017',
  format: 'iife',
  minify: isMinify,
  sourcemap: true,
  alias: {
    '@shared': '../mcp/src/shared',
  },
  plugins: [touchManifestPlugin],
  legalComments: 'none',
  keepNames: false,
};

(async () => {
  if (isWatch) {
    try {
      const ctx = await context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes...');
      // The watch mode will keep the process alive automatically
    } catch (error) {
      console.error('Initial build failed:', error);
      process.exit(1);
    }
  } else {
    // In regular build mode, exit on error
    await build(buildOptions).catch(() => process.exit(1));
  }
})();

