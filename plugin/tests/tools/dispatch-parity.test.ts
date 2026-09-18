// Cross-boundary parity: every tool the MCP registry forwards must have a
// plugin handler, and vice versa (minus NODE_ONLY_TOOLS which are
// Node-side by design). Catches rename drift at `make check` time
// instead of as a silent "Tool not found" / timeout at runtime.
import { describe, it, expect } from "vitest";
import { NODE_ONLY_TOOLS, NODE_WRAPPED_TOOLS, SIMPLE_TOOL_DEFS } from "../../../mcp/src/tools/registry";
import { TOOL_HANDLERS, dispatchTask } from "../../main/tools/dispatch";
import { setupFigma } from "../helpers";

describe("mcp registry <-> plugin dispatch parity", () => {
  it("every forwarded tool has a plugin handler", () => {
    for (const def of SIMPLE_TOOL_DEFS) {
      expect(TOOL_HANDLERS, `missing plugin handler: ${def.name}`).toHaveProperty(def.name);
    }
    for (const name of NODE_WRAPPED_TOOLS) {
      if ((NODE_ONLY_TOOLS as readonly string[]).includes(name)) continue;
      expect(TOOL_HANDLERS, `missing plugin handler: ${name}`).toHaveProperty(name);
    }
  });

  it("every plugin handler is registered in mcp (no orphans)", () => {
    const known = new Set([
      ...SIMPLE_TOOL_DEFS.map((d) => d.name),
      ...NODE_WRAPPED_TOOLS,
    ]);
    for (const name of Object.keys(TOOL_HANDLERS)) {
      expect(known.has(name), `orphan plugin handler: ${name}`).toBe(true);
    }
  });
});

describe("dispatch zod validation", () => {
  it("rejects malformed args with a clear error instead of crashing", async () => {
    setupFigma();
    const bad = await dispatchTask("delete-node", { id: "not-an-id!!!" });
    expect(bad.isError).toBe(true);
    expect(String(bad.content)).toContain("delete-node");
  });

  it("rejects non-object args", async () => {
    setupFigma();
    const bad = await dispatchTask("move-node", "nope");
    expect(bad.isError).toBe(true);
  });

  it("accepts valid args (passes schema, reaches handler)", async () => {
    setupFigma();
    const ok = await dispatchTask("get-pages", {});
    expect(ok.isError).toBe(false);
  });
});
