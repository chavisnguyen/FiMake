import { describe, it, expect } from "vitest";
import { safeToolProcessor } from "../../src/tools/safe-tool-processor";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toolText } from "../helpers";

describe("safeToolProcessor (mcp)", () => {
  it("stringifies content and preserves isError=false", async () => {
    const res: CallToolResult = await safeToolProcessor(Promise.resolve({ isError: false, content: { id: "1:2" } }));
    expect(res.isError).toBe(false);
    expect(JSON.parse(toolText(res))).toEqual({ id: "1:2" });
  });

  it("preserves isError=true from task result", async () => {
    const res: CallToolResult = await safeToolProcessor(Promise.resolve({ isError: true, content: "Parent not found" }));
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("Parent not found");
  });

  it("catches rejected promise (Error instance)", async () => {
    const res: CallToolResult = await safeToolProcessor(Promise.reject(new Error("socket down")));
    expect(res.isError).toBe(true);
    expect(toolText(res)).toBe("socket down");
  });

  it("catches rejected non-Error (stringifies)", async () => {
    const res: CallToolResult = await safeToolProcessor(Promise.reject({ code: 500 }));
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("500");
  });

  it("handles undefined/null content", async () => {
    const res: CallToolResult = await safeToolProcessor(Promise.resolve({ isError: false, content: undefined }));
    expect(res.isError).toBe(false);
  });
});
