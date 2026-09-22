/**
 * Socket.IO wire protocol between the MCP server and the Figma plugin.
 *
 * Single source of truth — imported by BOTH sides so neither can drift:
 * - server: `mcp/src/transport/socket-manager.ts` (sends `start-task`)
 * - plugin UI: `plugin/ui/adapters/taskSocket.ts` (ack + reply)
 * - e2e mock: `mcp/tests/e2e/mock-figma-plugin.ts` (replays fixtures)
 *
 * If you rename an event or reshape a payload, every side fails together
 * instead of the mock staying green while production breaks.
 */

/** Socket.IO event names on the MCP <-> plugin bridge. */
export const SOCKET_EVENTS = {
  START_TASK: "start-task",
  TASK_FINISHED: "task-finished",
  TASK_FAILED: "task-failed",
  CLIENT_HELLO: "client-hello",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Payload the MCP server sends for a `start-task` message. */
export interface StartTaskPayload {
  id: string;
  command: string;
  args: unknown;
  /**
   * Optional routing: when set, only the plugin window(s) matching the
   * target may execute the task. Omitted = broadcast (backwards compat —
   * old plugins and old callers keep working; they just ignore this key).
   */
  target?: TaskTarget;
}

// NOTE: explicit interface (not z.infer) because zod ≥3.25 infers
// `args: z.unknown()` as OPTIONAL (`args?: unknown`), while the UI domain
// (`NewTaskInput`) requires it. The guard below mirrors the old UI-side
// check exactly (id + command only) — zero behavior change, just shared.
export function isStartTaskPayload(value: unknown): value is StartTaskPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StartTaskPayload).id === "string" &&
    typeof (value as StartTaskPayload).command === "string"
  );
}

/**
 * Acknowledge a `start-task` so the server drops it from the retry queue.
 * The server sends with `sock.timeout().emit(...)` — a missing ack makes it
 * warn + requeue, which is exactly the flakiness the bridge was built to
 * avoid. Every `start-task` handler (real UI AND mock) must call this.
 */
export function acknowledgeStartTask(ack?: (received: boolean) => void): void {
  try {
    ack?.(true);
  } catch {
    // ignore ack errors — the task reply below is what actually settles it
  }
}

/**
 * Identity a plugin window announces so the server (and the user) can tell
 * multiple open Figma files apart. Sent once after connect via
 * `client-hello` — the UI iframe itself can't read the file name, the main
 * thread posts it over with FILE_INFO first.
 *
 * All fields optional: older clients / mocks simply announce `{}` and keep
 * working. `fileKey` is stable across renames, `fileName` is human-readable.
 */
export interface PluginClientInfo {
  fileName?: string;
  fileKey?: string;
}

export function isPluginClientInfo(value: unknown): value is PluginClientInfo {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  if ("fileName" in rec && rec.fileName !== undefined && typeof rec.fileName !== "string") return false;
  if ("fileKey" in rec && rec.fileKey !== undefined && typeof rec.fileKey !== "string") return false;
  return true;
}

/**
 * Routing target for a task. `fileKey` wins (stable across renames,
 * unique across files); `fileName` is the human fallback (may collide —
 * then every window with that name executes, same as broadcast for them).
 * Both omitted/empty = broadcast to all connected windows.
 */
export interface TaskTarget {
  fileKey?: string;
  fileName?: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isTaskTarget(value: unknown): value is TaskTarget {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  if ("fileKey" in rec && rec.fileKey !== undefined && typeof rec.fileKey !== "string") return false;
  if ("fileName" in rec && rec.fileName !== undefined && typeof rec.fileName !== "string") return false;
  return nonEmpty(rec.fileKey) || nonEmpty(rec.fileName);
}

/**
 * Split routing fields out of tool args. Agents pass `targetFileKey` /
 * `targetFileName` alongside normal params; the plugin must never see
 * them (its zod schemas don't declare them), so the orchestrator moves
 * them into the envelope and sends only the clean args over the wire.
 */
export function splitTarget(args: unknown): { cleanArgs: unknown; target?: TaskTarget } {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { cleanArgs: args };
  }
  const rec = args as Record<string, unknown>;
  const { targetFileKey, targetFileName, ...rest } = rec;
  const target: TaskTarget = {};
  if (nonEmpty(targetFileKey)) target.fileKey = targetFileKey;
  if (nonEmpty(targetFileName)) target.fileName = targetFileName;
  if (Object.keys(target).length === 0) return { cleanArgs: args };
  return { cleanArgs: rest, target };
}

/** Does a tracked client satisfy a task target? fileKey first, then name. */
export function matchesTarget(
  client: { fileKey?: string; fileName?: string },
  target: TaskTarget,
): boolean {
  if (nonEmpty(target.fileKey)) return client.fileKey === target.fileKey;
  if (nonEmpty(target.fileName)) return client.fileName === target.fileName;
  return true;
}
