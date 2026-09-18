import { vi } from "vitest";
import type { Mock } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "socket.io";
import type { SocketManager } from "../src/transport/socket-manager";
import type { TaskManager, TaskResult } from "../src/bridge/task-manager";
import type { FromPluginMessage } from "@shared/types/index";

// ---------------------------------------------------------------------------
// MCP tool handler
// ---------------------------------------------------------------------------

/** Single tool handler as stored by the mocked `server.tool()`. */
export type ToolHandler = (...args: unknown[]) => Promise<CallToolResult>;

export interface MockServerBundle {
  handlers: Map<string, ToolHandler>;
  server: McpServer;
}

/** Reusable mocked MCP server: captures every `tool(name, ..., fn)` registration. */
export function mockServerBundle(): MockServerBundle {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (...args: unknown[]): void => {
      const name = args[0] as string;
      const fn = args[args.length - 1] as ToolHandler;
      handlers.set(name, fn);
    },
  } as unknown as McpServer;
  return { handlers, server };
}

/** Fetch a registered handler or throw (keeps call sites typed, no `!` drift). */
export function getHandler(handlers: Map<string, ToolHandler>, name: string): ToolHandler {
  const handler = handlers.get(name);
  if (handler === undefined) {
    throw new Error(`tool not registered: ${name}`);
  }
  return handler;
}

// ---------------------------------------------------------------------------
// TaskManager mocks
// ---------------------------------------------------------------------------

export const DEFAULT_TASK_RESULT: TaskResult = { isError: false, content: { ok: 1 } };

/** Reusable TaskManager stub whose `runTask` resolves with `result`. */
export function mockTaskManager(result: TaskResult = DEFAULT_TASK_RESULT): TaskManager {
  return { runTask: vi.fn(async () => result) } as unknown as TaskManager;
}

/** Reusable TaskManager stub whose `runTask` delegates to `impl`. */
export function mockTaskManagerWith(
  impl: (command: string, args: unknown) => Promise<TaskResult> | TaskResult,
): TaskManager {
  return { runTask: vi.fn(impl) } as unknown as TaskManager;
}

/** Typed access to the mocked `runTask` for `toHaveBeenCalledWith` assertions. */
export function runTaskMock(tm: TaskManager): Mock {
  return (tm as unknown as { runTask: Mock }).runTask;
}

// ---------------------------------------------------------------------------
// CallToolResult helpers (parse the `{ content: [{ type: "text", text }] }` envelope)
// ---------------------------------------------------------------------------

/** Extract the text payload of a tool result; throws when the first block is not text. */
export function toolText(res: CallToolResult): string {
  const block = res.content[0];
  if (block === undefined || block.type !== "text") {
    throw new Error("expected CallToolResult with a leading text block");
  }
  return block.text;
}

/** Parse the text payload of a tool result as JSON. */
export function parseToolText<T>(res: CallToolResult): T {
  return JSON.parse(toolText(res)) as T;
}

// ---------------------------------------------------------------------------
// Orchestrator wiring mocks
// ---------------------------------------------------------------------------

export interface MockOrchestratorTaskManager {
  onTaskAdded: Mock;
  updateTask: Mock;
}

export interface MockOrchestratorSocketManager {
  sendMessage: Mock;
  onTaskFinished: Mock;
  onTaskError: Mock;
}

export function mockOrchestratorTaskManager(): MockOrchestratorTaskManager {
  return { onTaskAdded: vi.fn(), updateTask: vi.fn() };
}

export function mockOrchestratorSocketManager(sendMessage?: Mock): MockOrchestratorSocketManager {
  return {
    sendMessage: sendMessage ?? vi.fn(),
    onTaskFinished: vi.fn(),
    onTaskError: vi.fn(),
  };
}

export function asTaskManager(mock: MockOrchestratorTaskManager): TaskManager {
  return mock as unknown as TaskManager;
}

export function asSocketManager(mock: MockOrchestratorSocketManager): SocketManager {
  return mock as unknown as SocketManager;
}

/** Callback types captured via `mock.calls[0][0]` — avoids untyped indexing. */
export type OnTaskAddedCallback = Parameters<TaskManager["onTaskAdded"]>[0];
export type OnTaskFinishedCallback = Parameters<SocketManager["onTaskFinished"]>[0];
export type OnTaskErrorCallback = Parameters<SocketManager["onTaskError"]>[0];

/**
 * Minimal listener shape for the `onTaskAdded` subscription.
 * `Task` itself isn't exported, so tests subscribe through this structural
 * type instead of spelling the full internal interface.
 */
export type TaskAddedListener = (task: { id: string; command: string; args: unknown }) => void;

export function firstCallArg<T>(mock: Mock): T {
  return mock.mock.calls[0]?.[0] as T;
}

// ---------------------------------------------------------------------------
// TaskManager observable types
// ---------------------------------------------------------------------------

export type TaskAddedPayload = Parameters<OnTaskAddedCallback>[0];

/** The value a task settles with (`TaskResult`). */
export type SettledTask = TaskResult;

// ---------------------------------------------------------------------------
// socket.io fakes (only the surface SocketManager touches)
// ---------------------------------------------------------------------------

export type AckCallback = (err: unknown) => void;

export interface EmittedMessage {
  message: string;
  data: unknown;
}

export interface FakeSocketOptions {
  ackBehavior?: "ack" | "no-ack";
}

export interface FakeSocket {
  handlers: Map<string, (data: FromPluginMessage) => void>;
  emitted: EmittedMessage[];
  on(event: string, cb: (data: FromPluginMessage) => void): void;
  timeout(ms: number): {
    emit(message: string, data: unknown, ack?: AckCallback): void;
  };
  emit(...args: unknown[]): void;
}

export function createFakeSocket(opts: FakeSocketOptions = {}): FakeSocket {
  const handlers = new Map<string, (data: FromPluginMessage) => void>();
  const emitted: EmittedMessage[] = [];
  return {
    handlers,
    emitted,
    on(event: string, cb: (data: FromPluginMessage) => void): void {
      handlers.set(event, cb);
    },
    timeout(_ms: number) {
      return {
        emit(message: string, data: unknown, ack?: AckCallback): void {
          emitted.push({ message, data });
          if (opts.ackBehavior === "ack") {
            ack?.(null);
          } else {
            ack?.(new Error("ack timeout"));
          }
        },
      };
    },
    emit(..._args: unknown[]): void {},
  };
}

export interface FakeServer {
  handlers: Map<string, (socket: FakeSocket) => void>;
  on(event: string, cb: (socket: FakeSocket) => void): void;
  connect(socket: FakeSocket): void;
}

export function createFakeServer(): FakeServer {
  const handlers = new Map<string, (socket: FakeSocket) => void>();
  return {
    handlers,
    on(event: string, cb: (socket: FakeSocket) => void): void {
      handlers.set(event, cb);
    },
    connect(socket: FakeSocket): void {
      handlers.get("connection")?.(socket);
    },
  };
}

/** Adapt the fake to the `socket.io` Server type SocketManager expects. */
export function asSocketIoServer(fake: FakeServer): Server {
  return fake as unknown as Server;
}

/** Fire a plugin-side event on the fake socket with a typed payload. */
export function fireSocketEvent(
  socket: FakeSocket,
  event: string,
  data: FromPluginMessage,
): void {
  socket.handlers.get(event)?.(data);
}

// ---------------------------------------------------------------------------
// Generic test casts (for intentional invalid input)
// ---------------------------------------------------------------------------

/** Cast for tests that deliberately feed invalid runtime input to a typed API. */
export function cast<T>(value: unknown): T {
  return value as T;
}
