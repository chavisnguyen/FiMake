// Toggleable server logging.
// - info/warn/error: always on (task lifecycle, connections, timeouts).
// - debug: only with DEBUG=1 (or DEBUG=true) in env / mcp/.env — wire
//   payloads, acks, session sweeps. Use it when a task hangs: the last
//   "task added" line without a matching "task completed/failed" tells
//   you exactly which hop swallowed it.
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG?.toLowerCase() === "true";

export function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log("[fimake:debug]", ...args);
}

export function infoLog(...args: unknown[]): void {
  console.log("[fimake]", ...args);
}
