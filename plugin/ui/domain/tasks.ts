// Domain layer: task entities + pure business rules.
// Zero dependencies (no React, no socket, no DOM) — fully unit-testable.

export const MAX_TASKS = 200;

export type TaskRowStatus = "pending" | "done" | "failed";
export type TaskFilter = "all" | "pending" | "done" | "failed";

export interface Task {
  id: string;
  command: string;
  summary: string;
  title: string;
  time: string;
  startedAt: number;
  status: TaskRowStatus;
  note?: string;
  duration?: string;
}

export interface NewTaskInput {
  id: string;
  command: string;
  args: unknown;
  now?: number;
  timeLabel?: string;
}

/** Short one-line summary of task args (max 3 fields, truncated). */
export function summarizeArgs(args: unknown): string {
  if (typeof args !== "object" || args === null) {
    return "";
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? `[${value.length}]`
          : "{…}";
    parts.push(`${key}: ${text.length > 24 ? `${text.slice(0, 24)}…` : text}`);
    if (parts.length >= 3) {
      break;
    }
  }
  return parts.join(" · ");
}

/** Stringify plugin content for tooltips / failure notes (never throws). */
export function describeContent(content: unknown): string {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/** "350ms" / "1.2s" duration suffix appended to settled rows. */
export function formatDuration(ms: number): string {
  return ms < 1000 ? ` · ${ms}ms` : ` · ${(ms / 1000).toFixed(1)}s`;
}

/** Build a pending task row from a start-task payload. */
export function createTask(input: NewTaskInput): Task {
  const summary = summarizeArgs(input.args);
  return {
    id: input.id,
    command: input.command,
    summary,
    title: summary ? describeContent(input.args).slice(0, 500) : "",
    time: input.timeLabel ?? new Date().toLocaleTimeString(),
    startedAt: input.now ?? Date.now(),
    status: "pending",
  };
}

/**
 * Append a task, pruning back to `max` rows.
 * Prefer dropping the oldest settled row; pending rows stay visible.
 * Returns the pruned list + ids that were evicted (so callers can
 * drop matching entries from the start-time map).
 */
export function appendTask(list: Task[], task: Task, max: number = MAX_TASKS): { tasks: Task[]; evicted: string[] } {
  const next = [...list, task];
  const evicted: string[] = [];
  while (next.length > max) {
    const settledIdx = next.findIndex((t) => t.status !== "pending");
    const victimIdx = settledIdx === -1 ? 0 : settledIdx;
    const [victim] = next.splice(victimIdx, 1);
    if (victim) evicted.push(victim.id);
  }
  return { tasks: next, evicted };
}

/** Mark a task settled, stamping its duration from `startedAt`. */
export function settleTask(list: Task[], taskId: string, status: TaskRowStatus, note?: string, now: number = Date.now()): Task[] {
  return list.map((t) =>
    t.id === taskId
      ? { ...t, status, note: note?.slice(0, 300), duration: formatDuration(Math.max(0, now - t.startedAt)) }
      : t,
  );
}

/** Drop settled rows (Clear button). */
export function clearFinished(list: Task[]): Task[] {
  return list.filter((t) => t.status === "pending");
}

/** Filter rows for the toolbar (pure — replaces the old CSS data-filter hack). */
export function filterTasks(list: Task[], filter: TaskFilter): Task[] {
  return filter === "all" ? list : list.filter((t) => t.status === filter);
}

/** Resolve the socket URL: explicit ?socketUrl= wins, then ?port=, then default. */
export function resolveSocketUrl(search: string = window.location.search): string {
  try {
    const params = new URLSearchParams(search);
    const fromQuery = params.get("socketUrl");
    if (fromQuery) return fromQuery;
    const port = params.get("port");
    if (port && /^\d{1,5}$/.test(port)) return `ws://localhost:${port}`;
  } catch {
    // ignore — fall back to default
  }
  return "ws://localhost:10101";
}

/** Status copy for pill + console. */
export function statusLabel(connected: boolean): string {
  return connected ? "Connected — click to open" : "Not connected — click to open";
}

/** Which Figma file this plugin window belongs to (posted by main thread). */
export interface FileInfo {
  fileName: string;
  fileKey?: string;
}

export function isFileInfo(value: unknown): value is FileInfo {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.fileName === "string" && rec.fileName.length > 0;
}

/** "project: Landing page" — empty string until main posts FILE_INFO. */
export function projectLabel(info: FileInfo | null): string {
  if (info === null || info.fileName.length === 0) return "";
  return `project: ${info.fileName.length > 40 ? `${info.fileName.slice(0, 40)}…` : info.fileName}`;
}
