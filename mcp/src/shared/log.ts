// Toggleable server logging.
// - info/warn/error: always on (task lifecycle, connections, timeouts).
// - debug: only with DEBUG=1 (or DEBUG=true) in env / mcp/.env — wire
//   payloads, acks, session sweeps. Use it when a task hangs: the last
//   "task added" line without a matching "task completed/failed" tells
//   you exactly which hop swallowed it.
function isDebugEnabled(): boolean {
  const v = process.env.DEBUG;
  return v === "1" || v?.toLowerCase() === "true";
}

// Toggleable server logging.
//
// All server logs go to STDERR, never stdout: in `stdio` transport mode
// stdout is reserved for JSON-RPC frames — a single stray line there
// corrupts the MCP stream and disconnects the client.
export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) console.error("[fimake:debug]", ...args);
}

export function infoLog(...args: unknown[]): void {
  console.error("[fimake]", ...args);
}
