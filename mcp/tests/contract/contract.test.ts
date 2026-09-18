import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { generateUUID } from "../../src/utils";
import { CreateRectangleParamsSchema } from "../../src/shared/types/params/create/create-rectangle";
import { CloneNodeParamsSchema } from "../../src/shared/types/params/create/clone-node";
import { NODE_WRAPPED_TOOLS, SIMPLE_TOOL_DEFS } from "../../src/tools/registry";

describe("generateUUID", () => {
  it("matches v4 format", () => {
    expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateUUID()));
    expect(ids.size).toBe(1000);
  });
});

describe("shared zod schemas (MCP <-> plugin contract)", () => {
  it("create-rectangle accepts valid params, applies defaults", () => {
    const parsed = CreateRectangleParamsSchema.parse({ x: 0, y: 0, width: 100, height: 50 });
    expect(parsed.name).toBe("Rectangle");
  });

  it("create-rectangle rejects missing width/height", () => {
    expect(() => CreateRectangleParamsSchema.parse({ x: 0, y: 0 })).toThrow();
  });

  it("node id regex accepts 'page:node', rejects garbage", () => {
    expect(() => CloneNodeParamsSchema.parse({ id: "123:456" })).not.toThrow();
    expect(() => CloneNodeParamsSchema.parse({ id: "not-an-id!!!" })).toThrow();
  });
});

describe("README tool count stays in sync", () => {
  it("headline counts match registry + every tool has a table row", () => {
    const readme = fs.readFileSync(new URL("../../../README.md", import.meta.url), "utf-8");
    const total = SIMPLE_TOOL_DEFS.length + NODE_WRAPPED_TOOLS.length;
    const simple = SIMPLE_TOOL_DEFS.length;
    const wrapped = NODE_WRAPPED_TOOLS.length;
    expect(readme).toContain(`${total} tools: ${simple} forward directly`);
    expect(readme).toContain(`${wrapped} have extra Node-side logic`);
    for (const def of SIMPLE_TOOL_DEFS) {
      expect(readme).toContain(`| \`${def.name}\``);
    }
    for (const name of NODE_WRAPPED_TOOLS) {
      expect(readme).toContain(`| \`${name}\``);
    }
  });
});
