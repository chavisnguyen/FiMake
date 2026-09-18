import { describe, it, expect } from "vitest";
import {
  appendTask,
  clearFinished,
  createTask,
  describeContent,
  filterTasks,
  formatDuration,
  resolveSocketUrl,
  settleTask,
  statusLabel,
  summarizeArgs,
  type Task,
} from "../../ui/domain/tasks";

function task(id: string, status: Task["status"] = "pending"): Task {
  return {
    id,
    command: "move-node",
    summary: "",
    title: "",
    time: "t",
    startedAt: 1000,
    status,
  };
}

describe("summarizeArgs", () => {
  it("returns empty for non-objects", () => {
    expect(summarizeArgs(null)).toBe("");
    expect(summarizeArgs(undefined)).toBe("");
    expect(summarizeArgs("x")).toBe("");
    expect(summarizeArgs(42)).toBe("");
  });

  it("joins scalar fields, skips nullish", () => {
    expect(summarizeArgs({ id: "1:1", x: 5, skip: null, gone: undefined })).toBe("id: 1:1 · x: 5");
  });

  it("caps at 3 fields and truncates long values", () => {
    expect(summarizeArgs({ a: 1, b: 2, c: 3, d: 4 })).toBe("a: 1 · b: 2 · c: 3");
    expect(summarizeArgs({ url: "https://example.com/very-long-path-here" })).toBe(
      "url: https://example.com/very…",
    );
  });

  it("summarizes arrays and objects by shape", () => {
    expect(summarizeArgs({ ids: [1, 2, 3] })).toBe("ids: [3]");
    expect(summarizeArgs({ nested: { a: 1 } })).toBe("nested: {…}");
  });
});

describe("describeContent", () => {
  it("passes strings through, stringifies the rest, never throws", () => {
    expect(describeContent("boom")).toBe("boom");
    expect(describeContent({ ok: 1 })).toBe('{"ok":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeContent(circular)).toContain("[object Object]");
  });
});

describe("formatDuration", () => {
  it("uses ms under a second, seconds above", () => {
    expect(formatDuration(350)).toBe(" · 350ms");
    expect(formatDuration(1500)).toBe(" · 1.5s");
  });
});

describe("createTask / settleTask", () => {
  it("creates a pending row with summary + title", () => {
    const t = createTask({ id: "t1", command: "move-node", args: { id: "1:1" }, now: 1000, timeLabel: "T" });
    expect(t).toMatchObject({ id: "t1", status: "pending", summary: "id: 1:1", startedAt: 1000, time: "T" });
    expect(t.title).toContain("1:1");
  });

  it("settles with status, capped note and duration", () => {
    const settled = settleTask([task("t1")], "t1", "failed", "x".repeat(500), 2500);
    expect(settled[0]).toMatchObject({ status: "failed", duration: " · 1.5s" });
    expect(settled[0]?.note).toHaveLength(300);
  });

  it("ignores unknown ids", () => {
    expect(settleTask([task("t1")], "nope", "done")).toHaveLength(1);
  });
});

describe("appendTask", () => {
  it("drops the oldest settled row first", () => {
    const list = [task("done-1", "done"), task("pending-1"), task("done-2", "done")];
    const { tasks, evicted } = appendTask(list, task("new"), 3);
    expect(tasks.map((t) => t.id)).toEqual(["pending-1", "done-2", "new"]);
    expect(evicted).toEqual(["done-1"]);
  });

  it("drops the oldest pending row when nothing settled", () => {
    const { tasks, evicted } = appendTask([task("a"), task("b")], task("c"), 2);
    expect(tasks.map((t) => t.id)).toEqual(["b", "c"]);
    expect(evicted).toEqual(["a"]);
  });
});

describe("clearFinished / filterTasks", () => {
  it("clear keeps only pending", () => {
    expect(clearFinished([task("a"), task("b", "done"), task("c", "failed")]).map((t) => t.id)).toEqual(["a"]);
  });

  it("filter selects by status, all passes through", () => {
    const list = [task("a"), task("b", "done")];
    expect(filterTasks(list, "all")).toHaveLength(2);
    expect(filterTasks(list, "pending").map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(list, "done").map((t) => t.id)).toEqual(["b"]);
    expect(filterTasks(list, "failed")).toHaveLength(0);
  });
});

describe("resolveSocketUrl", () => {
  it("prefers ?socketUrl=, then ?port=, then default", () => {
    expect(resolveSocketUrl("?socketUrl=ws://x:1")).toBe("ws://x:1");
    expect(resolveSocketUrl("?port=5000")).toBe("ws://localhost:5000");
    expect(resolveSocketUrl("?port=abc")).toBe("ws://localhost:10101");
    expect(resolveSocketUrl("")).toBe("ws://localhost:10101");
  });
});

describe("statusLabel", () => {
  it("covers both states", () => {
    expect(statusLabel(true)).toContain("Connected");
    expect(statusLabel(false)).toContain("Not connected");
  });
});
