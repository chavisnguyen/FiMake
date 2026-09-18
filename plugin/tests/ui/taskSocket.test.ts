// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { connectTaskSocket } from "../../ui/adapters/taskSocket";

const { fakeSocket, emitted, ioMock, emitMock, onHandlers, offFinished, offFailed } = vi.hoisted(() => {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const onHandlers = new Map<string, (data: never) => void>();
  const offFinished = vi.fn();
  const offFailed = vi.fn();
  const fakeSocket = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, cb);
    }),
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    disconnect: vi.fn(),
  };
  const ioMock = vi.fn(() => fakeSocket);
  const emitMock = vi.fn();
  return { fakeSocket, emitted, ioMock, emitMock, onHandlers, offFinished, offFailed, handlers };
});

vi.mock("socket.io-client", () => ({ io: ioMock }));
vi.mock("@create-figma-plugin/utilities", () => ({
  emit: emitMock,
  on: vi.fn((name: string, cb: (data: never) => void) => {
    onHandlers.set(name, cb);
    return name === "TASK_FINISHED" ? offFinished : offFailed;
  }),
}));

function fireSocket(event: string, ...args: unknown[]): void {
  const handlers = (fakeSocket.on.mock.calls as Array<[string, (...a: unknown[]) => void]>).reduce(
    (m, [e, cb]) => m.set(e, cb),
    new Map<string, (...a: unknown[]) => void>(),
  );
  handlers.get(event)?.(...args);
}

function firePlugin(name: string, data: never): void {
  onHandlers.get(name)?.(data);
}

beforeEach(() => {
  vi.clearAllMocks();
  emitted.length = 0;
  onHandlers.clear();
});

describe("connectTaskSocket", () => {
  it("forwards connect/disconnect to onStatus", () => {
    const events = { onStatus: vi.fn(), onStartTask: vi.fn(), onSettle: vi.fn() };
    connectTaskSocket("ws://x", events);
    fireSocket("connect");
    fireSocket("disconnect");
    expect(events.onStatus).toHaveBeenNthCalledWith(1, true);
    expect(events.onStatus).toHaveBeenNthCalledWith(2, false);
  });

  it("validates start-task, emits START_TASK, acks and forwards", () => {
    const events = { onStatus: vi.fn(), onStartTask: vi.fn(), onSettle: vi.fn() };
    connectTaskSocket("ws://x", events);
    const ack = vi.fn();
    fireSocket("start-task", { id: "t1", command: "move-node", args: {} }, ack);
    expect(emitMock).toHaveBeenCalledWith("START_TASK", { taskId: "t1", command: "move-node", args: {} });
    expect(events.onStartTask).toHaveBeenCalledWith({ id: "t1", command: "move-node", args: {} });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it("acks malformed start-task without emitting", () => {
    const events = { onStatus: vi.fn(), onStartTask: vi.fn(), onSettle: vi.fn() };
    connectTaskSocket("ws://x", events);
    const ack = vi.fn();
    fireSocket("start-task", { id: 42 }, ack);
    expect(emitMock).not.toHaveBeenCalled();
    expect(events.onStartTask).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(true);
  });

  it("forwards TASK_FINISHED/FAILED to socket + onSettle", () => {
    const events = { onStatus: vi.fn(), onStartTask: vi.fn(), onSettle: vi.fn() };
    connectTaskSocket("ws://x", events);
    firePlugin("TASK_FINISHED", { taskId: "t1" } as never);
    firePlugin("TASK_FAILED", { taskId: "t2", content: "boom" } as never);
    expect(emitted).toContainEqual({ event: "task-finished", data: { taskId: "t1" } });
    expect(emitted).toContainEqual({ event: "task-failed", data: { taskId: "t2", content: "boom" } });
    expect(events.onSettle).toHaveBeenNthCalledWith(1, "t1", "done");
    expect(events.onSettle).toHaveBeenNthCalledWith(2, "t2", "failed", "boom");
  });

  it("disconnect unsubscribes and closes once", () => {
    const events = { onStatus: vi.fn(), onStartTask: vi.fn(), onSettle: vi.fn() };
    const handle = connectTaskSocket("ws://x", events);
    handle.disconnect();
    handle.disconnect();
    expect(offFinished).toHaveBeenCalledTimes(1);
    expect(offFailed).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});
