import { build, context } from 'esbuild';
import { utimesSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const manifestPath = resolve(__dirname, 'manifest.json');

function patchManifestForPort() {
  const rawPort = process.env.PORT ?? process.env.FIMAKE_PORT;
  const port = rawPort ? Number(rawPort) : 10101;
  if (!Number.isFinite(port) || port === 10101) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const domains = new Set([...(manifest.networkAccess?.allowedDomains ?? []), ...(manifest.networkAccess?.devAllowedDomains ?? [])]);
    const extra = [
      `http://localhost:${port}`,
      `ws://localhost:${port}`,
      `https://localhost:${port}`,
      `wss://localhost:${port}`,
    ];
    let changed = false;
    for (const d of extra) if (!domains.has(d)) changed = true;
    if (!changed) return false;
    const inject = (arr) => {
      const s = new Set(arr);
      for (const d of extra) s.add(d);
      return [...s];
    };
    manifest.networkAccess.allowedDomains = inject(manifest.networkAccess.allowedDomains ?? []);
    manifest.networkAccess.devAllowedDomains = inject(manifest.networkAccess.devAllowedDomains ?? []);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    console.log(`[fimake] patched manifest.json for PORT=${port}`);
    return true;
  } catch (e) {
    console.warn('Could not patch manifest.json for PORT:', e);
    return false;
  }
}

// Plugin to touch (and optionally patch) manifest.json on build
const touchManifestPlugin = {
  name: 'touch-manifest',
  setup(build) {
    build.onEnd(() => {
      try {
        patchManifestForPort();
        // Touch the file by updating its modification time
        const now = new Date();
        utimesSync(manifestPath, now, now);
      } catch (error) {
        console.warn('Could not touch manifest.json:', error);
      }
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
  target: 'es2020',
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

