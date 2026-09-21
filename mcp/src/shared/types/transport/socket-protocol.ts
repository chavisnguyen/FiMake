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
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Payload the MCP server sends for a `start-task` message. */
export interface StartTaskPayload {
  id: string;
  command: string;
  args: unknown;
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
