import { describe, it, expect, beforeAll } from "vitest";
import { serializeNode } from "../../main/serialization/serialization";
import {
  asSceneNode,
  fullChildren,
  sceneNodeStub,
  serializedChildren,
  setupFigma,
  solidPaints,
  type SceneNodeStub,
  type SerializedNode,
} from "../helpers";

// Figma plugin runtime exposes a global `figma` with a `mixed` sentinel.
// Stub the minimal surface serializeNode touches.
beforeAll(() => {
  setupFigma();
});

function rect(overrides: Partial<SceneNodeStub> = {}): SceneNodeStub {
  return sceneNodeStub({
    id: "1:1",
    name: "R",
    visible: true,
    x: 10.1234,
    y: 20,
    width: 100,
    height: 50,
    fills: solidPaints({ r: 1, g: 0, b: 0 }),
    ...overrides,
  });
}

describe("serializeNode", () => {
  it("serializes geometry rounded to 2 decimals + hex fills", () => {
    const out: SerializedNode = serializeNode(asSceneNode(rect()));
    expect(out).toMatchObject({ id: "1:1", name: "R", type: "RECTANGLE", x: 10.12 });
    const fills = out["fills"] as Array<{ color: string }>;
    expect(fills[0]?.color).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
  });

  it("depth 0 returns children as stubs + flags truncated", () => {
    const node: SceneNodeStub = {
      ...rect({ id: "0:0", name: "Frame", type: "FRAME" }),
      children: [rect({ id: "1:2", name: "A" }), rect({ id: "1:3", name: "B" })],
    };
    const out: SerializedNode = serializeNode(asSceneNode(node));
    expect(serializedChildren(out)).toHaveLength(2);
    expect(serializedChildren(out)[0]).toEqual({ id: "1:2", name: "A", type: "RECTANGLE" });
    expect(out["childrenTruncated"]).toBe(true);
  });

  it("respects maxNodes budget and reports _truncatedCount", () => {
    const kids = Array.from({ length: 10 }, (_, i) => rect({ id: `1:${i + 10}`, name: `K${i}` }));
    const node: SceneNodeStub = { ...rect({ id: "0:1", type: "FRAME" }), children: kids };
    const out: SerializedNode = serializeNode(asSceneNode(node), { depth: -1, maxNodes: 3 });
    // Only 3 fully expanded; rest become {_truncated:true} stubs.
    expect(fullChildren(out)).toHaveLength(3);
    expect(Number(out["_truncatedCount"])).toBeGreaterThan(0);
  });

  it("handles circular refs without infinite recursion", () => {
    const a: SceneNodeStub = rect({ id: "9:1", name: "A" });
    const b: SceneNodeStub = rect({ id: "9:2", name: "B", children: [a] });
    // Fake a cycle: a lists b as child (same object identity via id cache).
    a["children"] = [b];
    const out: SerializedNode = serializeNode(
      asSceneNode({ ...rect({ id: "9:0", type: "FRAME" }), children: [a, b] }),
      { depth: -1 },
    );
    expect(JSON.stringify(out)).toContain("_circular");
  });

  it("fields whitelist omits non-requested groups", () => {
    const out: SerializedNode = serializeNode(asSceneNode(rect()), { fields: ["geometry"] });
    expect(out["x"]).toBeDefined();
    expect(out["fills"]).toBeUndefined();
  });
});
