// Single source for the manifest PORT patch + touch, shared by
// esbuild.config.mjs (main) and vite.config.mts (UI). The two builders run
// concurrently in watch mode — one implementation means one behavior, and
// the write only happens when something actually changed (default
// PORT=10101 never dirties git).
import { utimesSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, "../manifest.json");

export function patchManifestForPort() {
  const rawPort = process.env.PORT ?? process.env.FIMAKE_PORT;
  const port = rawPort ? Number(rawPort) : 10101;
  if (!Number.isFinite(port) || port === 10101) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const extra = [
      `http://localhost:${port}`,
      `ws://localhost:${port}`,
      `https://localhost:${port}`,
      `wss://localhost:${port}`,
    ];
    const hasAll = extra.every((d) => manifest.networkAccess?.allowedDomains?.includes(d));
    if (hasAll) return false;
    const inject = (arr) => {
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

/** Touch mtime so Figma reloads the dev plugin after a rebuild. */
export function touchManifest() {
  try {
    const now = new Date();
    utimesSync(manifestPath, now, now);
  } catch (error) {
    console.warn("Could not touch manifest.json:", error);
  }
}
