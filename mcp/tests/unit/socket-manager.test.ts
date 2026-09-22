import { describe, it, expect, vi } from "vitest";
import { SocketManager } from "../../src/transport/socket-manager";
import {
  asSocketIoServer,
  cast,
  createFakeServer,
  createFakeSocket,
  fireSocketEvent,
} from "../helpers";

describe("SocketManager", () => {
  it("queues start-task when no plugin connected, flushes on connect", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    sm.sendMessage("start-task", { id: "task-1", command: "get-selection", args: {} });
    // No socket yet — nothing delivered, but queued internally.
    const socket = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket);
    // Flush delivers the queued task to the newly connected socket.
    expect(socket.emitted).toHaveLength(1);
    expect(socket.emitted[0]).toMatchObject({
      message: "start-task",
      data: { id: "task-1" },
    });
  });

  it("removes pending after plugin acks; does not resend on next connect", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const socket1 = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket1);
    sm.sendMessage("start-task", { id: "task-2", command: "x", args: {} });
    expect(socket1.emitted).toHaveLength(1);

    // Second plugin connects (e.g. user reopened panel) — acked task must NOT resend.
    const socket2 = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket2);
    expect(socket2.emitted).toHaveLength(0);
  });

  it("retries unacked start-task on next connection", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const socket1 = createFakeSocket({ ackBehavior: "no-ack" });
    server.connect(socket1);
    sm.sendMessage("start-task", { id: "task-3", command: "x", args: {} });
    expect(socket1.emitted).toHaveLength(1);

    // Ack timed out -> still pending -> retried when a new socket connects.
    const socket2 = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket2);
    expect(socket2.emitted).toHaveLength(1);
    expect(socket2.emitted[0]?.data).toMatchObject({ id: "task-3" });
  });

  it("routes task-finished to onTaskFinished and clears pending", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const onFinished = vi.fn();
    sm.onTaskFinished(onFinished);
    const socket = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket);

    fireSocketEvent(socket, "task-finished", { taskId: "task-9", content: { ok: 1 }, isError: false });
    expect(onFinished).toHaveBeenCalledWith({ taskId: "task-9", content: { ok: 1 }, isError: false });

    // Finished task must not be retried on a later reconnect.
    const socket2 = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket2);
    expect(socket2.emitted).toHaveLength(0);
  });

  it("routes task-failed to onTaskError", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const onError = vi.fn();
    sm.onTaskError(onError);
    const socket = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socket);

    fireSocketEvent(socket, "task-failed", { taskId: "task-8", content: "boom", isError: true });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("tracks plugin windows by client-hello (multi-window IDs)", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    expect(sm.isPluginConnected()).toBe(false);

    const socketA = createFakeSocket({ ackBehavior: "ack" });
    const socketB = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socketA);
    server.connect(socketB);
    expect(sm.getClientCount()).toBe(2);

    // Each window announces "tao là file X" — server remembers the name.
    const helloA = cast<(data: unknown) => void>(socketA.handlers.get("client-hello"));
    const helloB = cast<(data: unknown) => void>(socketB.handlers.get("client-hello"));
    helloA?.({ fileName: "Landing page", fileKey: "key-A" });
    helloB?.({ fileName: "Logo" });
    const clients = sm.getClients();
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.fileName).sort()).toEqual(["Landing page", "Logo"]);
    expect(sm.isPluginConnected()).toBe(true);

    // Malformed hello is ignored, never crashes tracking.
    helloA?.({ fileName: 42 });
    expect(sm.getClients().find((c) => c.fileKey === "key-A")?.fileName).toBe("Landing page");
  });

  it("delivers targeted tasks only to the matching window", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const socketA = createFakeSocket({ ackBehavior: "ack" });
    const socketB = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socketA);
    server.connect(socketB);
    cast<(data: unknown) => void>(socketA.handlers.get("client-hello"))?.({ fileName: "Landing page", fileKey: "key-A" });
    cast<(data: unknown) => void>(socketB.handlers.get("client-hello"))?.({ fileName: "Logo", fileKey: "key-B" });

    sm.sendMessage("start-task", { id: "t-A", command: "move-node", args: {}, target: { fileKey: "key-B" } });
    expect(socketB.emitted).toHaveLength(1);
    expect(socketA.emitted).toHaveLength(0);
  });

  it("queues targeted tasks when the right file is not open yet, delivers on hello", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const socketA = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socketA);
    cast<(data: unknown) => void>(socketA.handlers.get("client-hello"))?.({ fileName: "Landing page", fileKey: "key-A" });
    socketA.emitted.length = 0;

    // Target fileKey key-B is nowhere: nothing delivered, still queued.
    sm.sendMessage("start-task", { id: "t-wait", command: "move-node", args: {}, target: { fileKey: "key-B" } });
    expect(socketA.emitted).toHaveLength(0);
    expect(sm.getPendingCount()).toBe(1);

    // The right file connects and announces itself: task fires there, never at A.
    const socketB = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socketB);
    expect(socketA.emitted).toHaveLength(0);
    cast<(data: unknown) => void>(socketB.handlers.get("client-hello"))?.({ fileName: "Logo", fileKey: "key-B" });
    expect(socketB.emitted).toHaveLength(1);
    expect(socketB.emitted[0]).toMatchObject({ message: "start-task", data: { id: "t-wait" } });
    expect(socketA.emitted).toHaveLength(0);
  });

  it("matches by fileName when no fileKey is given", () => {
    const server = createFakeServer();
    const sm = new SocketManager(asSocketIoServer(server), 50);
    const socketA = createFakeSocket({ ackBehavior: "ack" });
    const socketB = createFakeSocket({ ackBehavior: "ack" });
    server.connect(socketA);
    server.connect(socketB);
    cast<(data: unknown) => void>(socketA.handlers.get("client-hello"))?.({ fileName: "Landing page" });
    cast<(data: unknown) => void>(socketB.handlers.get("client-hello"))?.({ fileName: "Logo" });

    sm.sendMessage("start-task", { id: "t-N", command: "get-pages", args: {}, target: { fileName: "Logo" } });
    expect(socketB.emitted).toHaveLength(1);
    expect(socketA.emitted).toHaveLength(0);
  });
});
