import { describe, it, expect } from "vitest";
import { safeToolProcessor } from "../../main/tools/safe-tool-processor";
import type { ToolResult } from "../../main/tools/tool-result";

describe("safeToolProcessor (plugin)", () => {
  it("passes through success", async () => {
    const run = safeToolProcessor(async () => ({ isError: false, content: { id: "1:1" } }));
    await expect(run({})).resolves.toEqual({ isError: false, content: { id: "1:1" } });
  });
  it("wraps thrown Error to isError with message", async () => {
    const run = safeToolProcessor(async () => {
      throw new Error("figma boom");
    });
    await expect(run({})).resolves.toEqual({ isError: true, content: "figma boom" });
  });
  it("stringifies non-Error throws", async () => {
    const run = safeToolProcessor(async (): Promise<ToolResult> => {
      throw "plain string";
    });
    const res: ToolResult = await run({});
    expect(res.isError).toBe(true);
  });
});
