import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import type { Server } from "socket.io";
import { TaskManager } from "../../src/bridge/task-manager";
import { SocketManager } from "../../src/transport/socket-manager";
import { Orchestrator } from "../../src/bridge/orchestrator";
import { createBridge, createMcpServer, SERVER_VERSION } from "../../src/bridge/server";
import { createSocketServer } from "../../src/transport/socket-server";
import {
  MAX_EXPORT_FRAMES,
  assertInsideDir,
  resolveExportDir,
} from "../../src/tools/read/export-file";
import { MAX_ASSET_BYTES, resolveAssetPath } from "../../src/tools/read/export-asset";
import {
  asSocketIoServer,
  asSocketManager,
  asTaskManager,
  cast,
  createFakeServer,
  createFakeSocket,
  fireSocketEvent,
  firstCallArg,
  mockOrchestratorSocketManager,
  mockOrchestratorTaskManager,
  type TaskAddedListener,
} from "../helpers";

describe("export guards", () => {
  it("resolveExportDir defaults under cwd/exports, blocks root + null bytes", () => {
    expect(resolveExportDir(undefined)).toContain("exports");
    expect(() => resolveExportDir("/")).toThrow();
    expect(() => resolveExportDir("a\0b")).toThrow();
  });

  it("assertInsideDir allows inside, blocks ../ escape", () => {
    const dir = path.resolve("exports-test");
    expect(() => assertInsideDir(dir, path.join(dir, "Page", "f.json"))).not.toThrow();
    expect(() => assertInsideDir(dir, path.join(dir, "..", "evil.json"))).toThrow();
  });

  it("resolveAssetPath blocks root + null bytes, resolves normal paths", () => {
    expect(() => resolveAssetPath("/")).toThrow();
    expect(() => resolveAssetPath("a\0b")).toThrow();
    expect(resolveAssetPath("out/a.png")).toBe(path.resolve("out/a.png"));
  });

  it("caps are sane", () => {
    expect(MAX_EXPORT_FRAMES).toBe(500);
    expect(MAX_ASSET_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe("TaskManager settlement hygiene", () => {
  it("pending count returns to 0 after completed + after timeout", async () => {
    const tm = new TaskManager(1000);
    tm.onTaskAdded((t) => {
      tm.updateTask(t.id, { ok: 1 }, "completed");
    });
    await tm.runTask("x", {});
    expect(tm.getPendingCount()).toBe(0);
    expect(tm.getPendingTaskIds()).toEqual([]);

    const tm2 = new TaskManager(20);
    const res = await tm2.runTask<{ isError: boolean }, Record<string, never>>("y", {});
    expect(res.isError).toBe(true);
    expect(tm2.getPendingCount()).toBe(0);
  });
});

describe("SocketManager TTL + retry budget + multi-socket", () => {
  it("pruneExpired drops entries older than TTL", async () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50, 60, 5);
    sm.sendMessage("start-task", { id: "ttl-1", command: "x", args: {} });
    expect(sm.getPendingCount()).toBe(1);
    await new Promise((r) => setTimeout(r, 90));
    expect(sm.pruneExpired()).toBe(1);
    expect(sm.getPendingCount()).toBe(0);
  });

  it("drops unacked task after maxRetries reconnects", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50, 300000, 1);
    server.connect(createFakeSocket({ ackBehavior: "no-ack" }));
    sm.sendMessage("start-task", { id: "retry-1", command: "x", args: {} });
    expect(sm.getPendingCount()).toBe(1);
    server.connect(createFakeSocket({ ackBehavior: "no-ack" })); // retry 1
    expect(sm.getPendingCount()).toBe(1);
    server.connect(createFakeSocket({ ackBehavior: "no-ack" })); // over budget -> dropped
    expect(sm.getPendingCount()).toBe(0);
  });

  it("falls back to another socket after active disconnects", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const sA = createFakeSocket({ ackBehavior: "ack" });
    const sB = createFakeSocket({ ackBehavior: "ack" });
    server.connect(sA);
    server.connect(sB);
    fireSocketEvent(sA, "disconnect", cast<never>("x"));
    sm.sendMessage("start-task", { id: "fb-1", command: "x", args: {} });
    expect(sB.emitted).toHaveLength(1);
  });
});

describe("orchestrator wire payload", () => {
  it("sends only {id, command, args} — never internal resolve/reject/timer", () => {
    const sendMessage = vi.fn();
    const taskManagerMock = mockOrchestratorTaskManager();
    const socketManagerMock = mockOrchestratorSocketManager(sendMessage);
    new Orchestrator(asSocketManager(socketManagerMock), asTaskManager(taskManagerMock));
    const onAdded = firstCallArg<TaskAddedListener>(taskManagerMock.onTaskAdded);
    // Poisoned internal task: functions + circular timer must not leak out.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    onAdded(cast<Parameters<TaskAddedListener>[0]>({
      id: "t9",
      command: "move-node",
      args: { id: "1:1" },
      status: "pending",
      resolve: () => {},
      reject: () => {},
      timer: circular,
    }));
    expect(sendMessage).toHaveBeenCalledWith("start-task", {
      id: "t9",
      command: "move-node",
      args: { id: "1:1" },
    });
    const payload = sendMessage.mock.calls[0]?.[1] as unknown;
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});

describe("bridge isolation", () => {  it("two McpServers share one TaskManager and differ", async () => {
    const fakeIo = { on: vi.fn() };
    const bridge = createBridge(fakeIo as unknown as Server);
    const s1 = createMcpServer(bridge.taskManager);
    const s2 = createMcpServer(bridge.taskManager);
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1).not.toBe(s2);
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe("socket-server helper", () => {
  it("builds a Socket.IO server on a plain http server", () => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer);
    expect(io).toBeDefined();
    expect(io.engine).toBeDefined();
    io.close();
  });
});

describe("version parity guard", () => {
  it("version single-source: plugin + SERVER_VERSION match mcp/package.json", async () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    const pluginPkg = JSON.parse(
      fs.readFileSync(new URL("../../../plugin/package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    expect(pluginPkg.version).toBe(pkg.version);
    const { SERVER_VERSION } = await import("../../src/bridge/server.js");
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
