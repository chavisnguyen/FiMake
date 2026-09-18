import { describe, it, expect, vi } from "vitest";
import { SocketManager } from "../../src/transport/socket-manager";
import {
  asSocketIoServer,
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
});
