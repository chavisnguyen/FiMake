import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { patchManifestForPort, touchManifest } from "./scripts/patch-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// "v1.0.36 · 028008a" (+"-dirty HH:MM" for uncommitted builds) so dev and release
// builds of the same version are distinguishable in the plugin UI.
function buildLabel(): string {
  const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string };
  try {
    const sha = execSync("git describe --always --dirty --match=__none__", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    // Dirty builds share a sha, so add the build time to tell rebuilds apart.
    return sha.endsWith("-dirty") ? `v${version} · ${sha} ${new Date().toTimeString().slice(0, 5)}` : `v${version} · ${sha}`;
  } catch {
    return `v${version}`;
  }
}

function touchManifestPlugin(): Plugin {
  return {
    name: "touch-manifest",
    closeBundle() {
      // Single shared implementation with esbuild.config.mjs (see
      // scripts/patch-manifest.mjs) — concurrent watch builds agree.
      patchManifestForPort();
      touchManifest();
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  root: "./ui",
  plugins: [react(), viteSingleFile(), touchManifest()],
  define: {
    __FIMAKE_BUILD__: JSON.stringify(buildLabel()),
  },
  // Mirrors esbuild.config.mjs + vitest.config.ts + tsconfig paths:
  // `@shared/*` is the single source in mcp/src/shared. Needed now that
  // ui/adapters/taskSocket.ts value-imports the socket protocol.
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../mcp/src/shared"),
    },
  },
  build: {
    target: "es2017",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    sourcemap: true,
    cssCodeSplit: false,
    outDir: "../dist",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2017",
    },
  },
});

