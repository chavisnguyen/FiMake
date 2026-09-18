import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskManager } from "../../src/bridge/task-manager";
import type { SettledTask, TaskAddedPayload } from "../helpers";

describe("TaskManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runTask resolves when plugin reports finished", async () => {
    const tm = new TaskManager(1000);
    let taskId = "";
    tm.onTaskAdded((t: TaskAddedPayload) => {
      taskId = t.id;
    });
    const promise = tm.runTask("create-rectangle", { x: 1 });
    expect(taskId).not.toBe("");
    tm.updateTask(taskId, { id: "1:2" }, "completed");
    await expect(promise).resolves.toEqual({
      isError: false,
      content: { id: "1:2" },
    });
  });

  it("addTask + updateTask(completed) resolves with content", async () => {
    const tm = new TaskManager(1000);
    let resolved!: SettledTask;
    tm.addTask("t1", "get-selection", {}, (r: SettledTask) => (resolved = r), () => {});
    tm.updateTask("t1", { nodes: [] }, "completed");
    expect(resolved).toEqual({ isError: false, content: { nodes: [] } });
  });

  it("updateTask(failed) resolves with isError=true", async () => {
    const tm = new TaskManager(1000);
    let resolved!: SettledTask;
    tm.addTask("t2", "x", {}, (r: SettledTask) => (resolved = r), () => {});
    tm.updateTask("t2", { error: "boom" }, "failed");
    expect(resolved.isError).toBe(true);
  });

  it("runTask times out with isError=true", async () => {
    const tm = new TaskManager(500);
    const promise = tm.runTask<SettledTask, { id: string }>("move-node", { id: "1:2" });
    const assertion = promise.then((r: SettledTask) => {
      expect(r.isError).toBe(true);
      expect(r.content).toEqual({ error: "Task timed out" });
    });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it("ignores second update after completed (no double-resolve overwrite)", async () => {
    const tm = new TaskManager(1000);
    let resolved!: SettledTask;
    let calls = 0;
    tm.addTask(
      "t3",
      "x",
      {},
      (r: SettledTask) => {
        calls++;
        resolved = r;
      },
      () => {}
    );
    tm.updateTask("t3", { ok: 1 }, "completed");
    tm.updateTask("t3", { ok: 2 }, "failed"); // should be ignored
    expect(calls).toBe(1);
    expect(resolved).toEqual({ isError: false, content: { ok: 1 } });
  });

  it("ignores update for unknown id without throwing", () => {
    const tm = new TaskManager(1000);
    expect(() => tm.updateTask("nope", {}, "completed")).not.toThrow();
  });

  it("calls onTaskAdded when a task is added", () => {
    const tm = new TaskManager(1000);
    const cb = vi.fn();
    tm.onTaskAdded(cb);
    tm.addTask("t4", "get-pages", {}, () => {}, () => {});
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toMatchObject({ id: "t4", command: "get-pages" });
  });
});
