import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { utimesSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function patchManifestForPort(): boolean {
  const rawPort = process.env.PORT ?? process.env.FIMAKE_PORT;
  const port = rawPort ? Number(rawPort) : 10101;
  if (!Number.isFinite(port) || port === 10101) return false;
  try {
    const manifestPath = resolve(__dirname, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const extra = [
      `http://localhost:${port}`,
      `ws://localhost:${port}`,
      `https://localhost:${port}`,
      `wss://localhost:${port}`,
    ];
    const hasAll = extra.every((d) => manifest.networkAccess?.allowedDomains?.includes(d));
    if (hasAll) return false;
    const inject = (arr: string[]) => {
      const s = new Set(arr);
      for (const d of extra) s.add(d);
      return [...s];
    };
    manifest.networkAccess.allowedDomains = inject(manifest.networkAccess.allowedDomains ?? []);
    manifest.networkAccess.devAllowedDomains = inject(manifest.networkAccess.devAllowedDomains ?? []);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    console.log(`[fimake] patched manifest.json for PORT=${port}`);
    return true;
  } catch (e) {
    console.warn("Could not patch manifest.json for PORT:", e);
    return false;
  }
}

// Plugin to touch (and optionally patch) manifest.json on build
function touchManifest(): Plugin {
  return {
    name: "touch-manifest",
    closeBundle() {
      try {
        patchManifestForPort();
        const manifestPath = resolve(__dirname, "manifest.json");
        // Touch the file by updating its modification time
        const now = new Date();
        utimesSync(manifestPath, now, now);
      } catch (error) {
        // If file doesn't exist or can't be touched, create/update it
        // This shouldn't happen, but handle gracefully
        console.warn("Could not touch manifest.json:", error);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  root: "./ui",
  plugins: [react(), viteSingleFile(), touchManifest()],
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

