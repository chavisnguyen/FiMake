import { describe, it, expect, beforeEach, vi } from "vitest";
import { getFigma, setupFigma, type MockFigma, type SceneNodeStub } from "../helpers";
import type { ToolResult } from "../../main/tools/tool-result";
import { batchCreate, type ToolHandlers } from "../../main/tools/create/batch-create";
import { dispatchTask } from "../../main/tools/dispatch";

describe("batchCreate (unit, fake handlers)", () => {
  function fakeHandlers(failOn?: string): { handlers: ToolHandlers; calls: Array<[string, Record<string, unknown>]> } {
    const calls: Array<[string, Record<string, unknown>]> = [];
    let next = 1;
    const make = (name: string) => async (args: unknown): Promise<ToolResult> => {
      calls.push([name, args as Record<string, unknown>]);
      if (name === failOn) return { isError: true, content: "Parent node not found" };
      const a = args as { id?: string };
      return { isError: false, content: { id: a.id ?? `9:${next++}` } };
    };
    const handlers: ToolHandlers = {};
    for (const name of ["create-frame", "create-text", "create-rectangle", "set-layout"]) handlers[name] = make(name);
    return { handlers, calls };
  }

  it("runs in order and resolves $refs to ids created earlier", async () => {
    const { handlers, calls } = fakeHandlers();
    const res = await batchCreate({
      operations: [
        { op: "create-frame", ref: "row", params: { x: 0, y: 0, width: 600, height: 56, name: "Email Row", parentId: "1:1" } },
        { op: "create-text", params: { x: 0, y: 0, text: "Email", fontSize: 14, fontName: "Inter", fontWeight: 400, fontColor: "#000000FF", name: "Label", parentId: "$row" } },
        { op: "set-layout", params: { id: "$row", mode: "HORIZONTAL" } },
      ],
    }, handlers);
    expect(res.isError).toBe(false);
    expect(calls.map(([name]) => name)).toEqual(["create-frame", "create-text", "set-layout"]);
    expect(calls[1]?.[1]["parentId"]).toBe("9:1");
    expect(calls[2]?.[1]["id"]).toBe("9:1");
    expect(res.content).toEqual({
      created: [
        { index: 0, op: "create-frame", ref: "row", id: "9:1" },
        { index: 1, op: "create-text", id: "9:2" },
        { index: 2, op: "set-layout", id: "9:1" },
      ],
    });
  });

  it("stops at the first failure, reporting index, reason and what was already created", async () => {
    const { handlers, calls } = fakeHandlers("create-text");
    const res = await batchCreate({
      operations: [
        { op: "create-frame", ref: "row", params: { x: 0, y: 0, width: 10, height: 10, name: "F" } },
        { op: "create-text", params: { x: 0, y: 0, text: "x", fontSize: 14, fontName: "Inter", fontWeight: 400, fontColor: "#000000FF", name: "T", parentId: "$row" } },
        { op: "set-layout", params: { id: "$row", mode: "VERTICAL" } },
      ],
    }, handlers);
    expect(res).toEqual({
      isError: true,
      content: { failedIndex: 1, op: "create-text", reason: "Parent node not found", created: [{ index: 0, op: "create-frame", ref: "row", id: "9:1" }] },
    });
    expect(calls).toHaveLength(2);
  });

  it("rejects unknown and duplicate refs without calling the op", async () => {
    const { handlers, calls } = fakeHandlers();
    const unknown = await batchCreate({ operations: [{ op: "set-layout", params: { id: "$nope", mode: "HORIZONTAL" } }] }, handlers);
    expect((unknown.content as { reason: string }).reason).toContain('Unknown ref "$nope"');
    expect((unknown.content as { hint: string }).hint).toContain("no refs defined yet");
    expect(calls).toHaveLength(0);
    const dup = await batchCreate({
      operations: [
        { op: "create-frame", ref: "a", params: { x: 0, y: 0, width: 1, height: 1, name: "A" } },
        { op: "create-frame", ref: "a", params: { x: 0, y: 0, width: 1, height: 1, name: "B" } },
      ],
    }, handlers);
    expect((dup.content as { failedIndex: number; reason: string })).toMatchObject({ failedIndex: 1, reason: 'Duplicate ref "a"' });
    // Duplicate fails BEFORE the second handler runs (no wasted tool call).
    expect(calls.map(([name]) => name)).toEqual(["create-frame"]);
  });

  it("unsupported op names the valid ops", async () => {
    const { handlers } = fakeHandlers();
    // "delete-node" can't happen through dispatch (schema rejects it first);
    // exercise batchCreate's own guard directly.
    const res = await batchCreate({ operations: [{ op: "delete-node", params: { id: "5:1" } } as never] }, handlers);
    expect(res.isError).toBe(true);
    expect((res.content as { reason: string }).reason).toContain("Unsupported op");
    expect((res.content as { hint: string }).hint).toContain("create-frame");
  });

  it("atomic:true removes created nodes on failure", async () => {
    setupFigma();
    const { handlers } = fakeHandlers("create-text");
    const removed: string[] = [];
    (globalThis as unknown as { figma: { getNodeByIdAsync: (id: string) => Promise<unknown> } }).figma.getNodeByIdAsync =
      (async (id: string) => ({ id, remove: () => { removed.push(id); } })) as never;
    const res = await batchCreate({
      atomic: true,
      operations: [
        { op: "create-frame", ref: "row", params: { x: 0, y: 0, width: 10, height: 10, name: "F" } },
        { op: "create-text", params: { x: 0, y: 0, text: "x", fontSize: 14, fontName: "Inter", fontWeight: 400, fontColor: "#000000FF", name: "T", parentId: "$row" } },
      ],
    }, handlers);
    expect(res.isError).toBe(true);
    expect(res.content).toMatchObject({ failedIndex: 1, atomic: true, rolledBack: 1 });
    expect(removed).toEqual(["9:1"]);
  });
});

describe("batch-create through dispatchTask (real schemas + handlers)", () => {
  beforeEach(() => setupFigma());

  it("accepts $refs at the batch level and hands real ids to each tool's own schema", async () => {
    const figma: MockFigma = getFigma();
    const frame: SceneNodeStub = { id: "5:1", name: "Row", type: "FRAME", x: 0, y: 0, width: 10, height: 10, resize: vi.fn(), appendChild: vi.fn() };
    const rect: SceneNodeStub = { id: "5:2", name: "Input", type: "RECTANGLE", x: 0, y: 0, width: 10, height: 10, cornerRadius: 0, resize: vi.fn() };
    figma.createFrame.mockReturnValue(frame);
    figma.createRectangle.mockReturnValue(rect);
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "5:1" ? frame : id === "5:2" ? rect : null));

    const res = await dispatchTask("batch-create", {
      operations: [
        { op: "create-frame", ref: "row", params: { x: 0, y: 0, width: 600, height: 56 } },
        { op: "create-rectangle", ref: "input", params: { x: 0, y: 0, width: 400, height: 56, parentId: "$row" } },
        { op: "set-corner-radius", params: { id: "$input", cornerRadius: 4 } },
      ],
    });
    expect(res.isError).toBe(false);
    expect(frame["appendChild"]).toHaveBeenCalledWith(rect);
    expect(rect["cornerRadius"]).toBe(4);
    expect(res.content).toMatchObject({ created: [{ ref: "row", id: "5:1" }, { ref: "input", id: "5:2" }, { op: "set-corner-radius", id: "5:2" }] });

    const bad = await dispatchTask("batch-create", { operations: [{ op: "delete-node", params: { id: "5:1" } }] });
    expect(bad.isError).toBe(true);
  });
});
