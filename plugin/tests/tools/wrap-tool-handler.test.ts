import { describe, it, expect } from "vitest";
import { wrapToolHandler } from "../../main/tools/wrap-tool-handler";
import type { ToolResult } from "../../main/tools/tool-result";

describe("wrapToolHandler (plugin)", () => {
  it("passes through success", async () => {
    const run = wrapToolHandler(async () => ({ isError: false, content: { id: "1:1" } }));
    await expect(run({})).resolves.toEqual({ isError: false, content: { id: "1:1" } });
  });
  it("wraps thrown Error to isError with message", async () => {
    const run = wrapToolHandler(async () => {
      throw new Error("figma boom");
    });
    await expect(run({})).resolves.toEqual({ isError: true, content: "figma boom" });
  });
  it("stringifies non-Error throws", async () => {
    const run = wrapToolHandler(async (): Promise<ToolResult> => {
      throw "plain string";
    });
    const res: ToolResult = await run({});
    expect(res.isError).toBe(true);
  });
});
