// Mock Figma Plugin — record-replay layer cho E2E.
//
// Giả làm Figma plugin thật ở phía socket:
//   MCP server (thật) --start-task--> MockPlugin --task-finished/task-failed--> MCP
//
// - Replay: đọc fixtures/*.json (data THẬT đã capture từ Figma) và trả lại.
// - Chưa có fixture cho command nào -> trả task-failed với message rõ ràng,
//   để khi bạn thêm/sửa tool mà quên record lại thì E2E báo ngay thay vì timeout.
// - Write-tools (move/create/...) echo args vào template để chứng minh
//   round-trip args đi qua socket nguyên vẹn.
//
// Chạy ở CI mà không cần mở Figma Desktop.
// Record lại data thật khi Figma đang mở: xem record-fixtures.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  acknowledgeStartTask,
  isStartTaskPayload,
  type StartTaskPayload,
} from "@shared/types";

interface FixtureFile {
  _meta?: { command?: string };
  request?: { command?: string; args?: unknown };
  response?: { isError?: boolean; content?: unknown };
}

export interface MockPluginOptions {
  /** dir chứa fixtures/*.json (default: ./fixtures cạnh file này) */
  fixturesDir?: string;
  /** giả lập độ trễ plugin thật (ms) */
  latencyMs?: number;
}

/** Merge args của write-tools vào template để E2E assert được round-trip. */
function echoArgs(command: string, args: unknown, content: unknown): unknown {
  if (Array.isArray(content)) return content; // read-tools trả list: giữ nguyên
  if (typeof args !== "object" || args === null) return content;
  if (typeof content !== "object" || content === null) return content;
  const a = args as Record<string, unknown>;
  const base = { ...(content as Record<string, unknown>) };
  // move-node / resize-node / create-*: giữ id template, echo geometry từ args
  for (const k of ["x", "y", "width", "height"]) {
    if (typeof a[k] === "number") base[k] = a[k];
  }
  if (typeof a["id"] === "string" && command === "move-node") base["id"] = a["id"];
  return base;
}

export class MockFigmaPlugin {
  private socket: Socket | null = null;
  private fixtures = new Map<string, { isError: boolean; content: unknown }>();
  readonly received: StartTaskPayload[] = [];

  constructor(private url: string, private opts: MockPluginOptions = {}) {}

  /** Load mọi fixtures/*.json vào map theo command. */
  loadFixtures(dir?: string): void {
    const fixturesDir =
      dir ??
      this.opts.fixturesDir ??
      path.dirname(fileURLToPath(import.meta.url)) + "/fixtures";
    this.fixtures.clear();
    if (!fs.existsSync(fixturesDir)) return;
    for (const f of fs.readdirSync(fixturesDir)) {
      if (!f.endsWith(".json")) continue;
      const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), "utf-8")) as FixtureFile;
      const cmd = raw.request?.command ?? raw._meta?.command ?? path.basename(f, ".json");
      if (!cmd || raw.response === undefined) continue;
      this.fixtures.set(cmd, {
        isError: raw.response.isError ?? false,
        content: raw.response.content ?? null,
      });
    }
  }

  fixtureCommands(): string[] {
    return [...this.fixtures.keys()].sort();
  }

  async connect(): Promise<void> {
    this.loadFixtures();
    await new Promise<void>((resolve, reject) => {
      const s: Socket = io(this.url, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 300,
      });
      this.socket = s;
      const timer = setTimeout(() => reject(new Error(`mock-plugin connect timeout: ${this.url}`)), 10000);
      s.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      s.on("connect_error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      // Quan trọng: ack để server xóa pending queue (shared
      // acknowledgeStartTask — cùng 1 hàm plugin thật dùng).
      // Không ack -> server retry + warn.
      s.on(SOCKET_EVENTS.START_TASK, (task: unknown, ack?: (ok: boolean) => void) => {
        acknowledgeStartTask(ack);
        void this.handle(task);
      });
    });
  }

  private async handle(task: unknown): Promise<void> {
    if (!isStartTaskPayload(task)) return;
    this.received.push(task);
    const latency = this.opts.latencyMs ?? 0;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));

    const hit = this.fixtures.get(task.command);
    if (!hit) {
      this.socket?.emit(SOCKET_EVENTS.TASK_FAILED, {
        taskId: task.id,
        isError: true,
        content: `No fixture for command "${task.command}" (fixtureCommands: [${this.fixtureCommands().join(", ")}]). Did you add a new tool without recording? Run pnpm record:e2e with real Figma open.`,
      });
      return;
    }
    const content = echoArgs(task.command, task.args, structuredClone(hit.content));
    if (hit.isError) {
      this.socket?.emit(SOCKET_EVENTS.TASK_FAILED, { taskId: task.id, isError: true, content });
    } else {
      this.socket?.emit(SOCKET_EVENTS.TASK_FINISHED, { taskId: task.id, isError: false, content });
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
