// Regression test for the figma.ui.onmessage overwrite bug:
// main.ts registers START_TASK via utilities `on()` AND assigns its own
// resize handler to the same single-slot figma.ui.onmessage. Overwriting
// instead of chaining silently drops every START_TASK — green pill,
// all tasks time out.
//
// NOTE: main.ts is loaded ONCE here (like Figma loads it once per run).
// Re-importing it per test does NOT model production: the utilities
// module assigns figma.ui.onmessage at evaluation time, so a second
// evaluation wires a different object graph. Single load + mock reset
// between tests is the faithful setup.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { setupFigma } from "../helpers";

interface FakeUi {
  onmessage: ((msg: unknown) => void) | undefined;
  postMessage: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
}

function getUi(): FakeUi {
  const figma = (globalThis as unknown as { figma: Record<string, unknown> }).figma;
  return figma.ui as FakeUi;
}

beforeAll(async () => {
  const figma = setupFigma();
  figma.showUI = vi.fn();
  figma.ui = { onmessage: undefined, postMessage: vi.fn(), resize: vi.fn() };
  vi.stubGlobal("__html__", "");
  await import("../../main/main");
});

beforeEach(() => {
  const ui = getUi();
  ui.postMessage.mockClear();
  ui.resize.mockClear();
  const figma = (globalThis as unknown as { figma: ReturnType<typeof setupFigma> }).figma;
  figma.getNodeByIdAsync.mockResolvedValue(null);
  figma.root.findAllWithCriteria.mockReturnValue([]);
});

describe("main thread message wiring", () => {
  it("START_TASK array reaches dispatch and replies TASK_FINISHED", async () => {
    const ui = getUi();
    expect(typeof ui.onmessage).toBe("function");

    ui.onmessage!(["START_TASK", { taskId: "t1", command: "get-pages", args: {} }]);
    await vi.waitFor(() => {
      expect(ui.postMessage).toHaveBeenCalledWith([
        "TASK_FINISHED",
        expect.objectContaining({ taskId: "t1", isError: false }),
      ]);
    });
  });

  it("resize object resizes AND START_TASK still works", async () => {
    const ui = getUi();

    ui.onmessage!({ type: "expand" });
    expect(ui.resize).toHaveBeenCalledWith(600, 640);
    ui.onmessage!({ type: "collapse" });
    expect(ui.resize).toHaveBeenCalledWith(300, 78);

    // The resize branch must not have eaten the task branch.
    ui.onmessage!(["START_TASK", { taskId: "t2", command: "get-pages", args: {} }]);
    await vi.waitFor(() => {
      expect(ui.postMessage).toHaveBeenCalledWith([
        "TASK_FINISHED",
        expect.objectContaining({ taskId: "t2" }),
      ]);
    });
  });

  it("unknown command replies TASK_FAILED instead of hanging", async () => {
    const ui = getUi();
    ui.onmessage!(["START_TASK", { taskId: "t3", command: "nope", args: {} }]);
    await vi.waitFor(() => {
      expect(ui.postMessage).toHaveBeenCalledWith([
        "TASK_FAILED",
        expect.objectContaining({ taskId: "t3", isError: true }),
      ]);
    });
  });
});
