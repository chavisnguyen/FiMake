import { describe, it, expect, beforeAll } from "vitest";
import { serializeNode } from "../../main/serialization/serialization";
import {
  asSceneNode,
  figmaMixed,
  setupFigma,
  type SceneNodeStub,
  type SerializedNode,
} from "../helpers";

beforeAll(() => {
  setupFigma();
});

describe("serializeNode advanced", () => {
  it("emits segments for mixed-style text", () => {
    const MIXED = figmaMixed();
    const stub: SceneNodeStub = {
      id: "2:1", name: "T", type: "TEXT", visible: true,
      characters: "Hi*",
      fontSize: MIXED, fontName: MIXED, fontWeight: MIXED,
      textDecoration: MIXED, fills: MIXED,
      textAlignHorizontal: "LEFT", textAlignVertical: "TOP",
      textCase: "ORIGINAL",
      getStyledTextSegments: () => [{ characters: "Hi", fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }], fontName: { family: "Inter", style: "Regular" }, fontSize: 14, fontWeight: 400 }],
    };
    const out: SerializedNode = serializeNode(asSceneNode(stub));
    const segments = out["segments"] as Array<{ characters: string }>;
    expect(segments).toHaveLength(1);
    expect(segments[0]?.characters).toBe("Hi");
  });

  it("serializes gradient + effects", () => {
    const stub: SceneNodeStub = {
      id: "1:5", name: "G", type: "RECTANGLE", x: 0, y: 0, width: 10, height: 10,
      fills: [{ type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0 } }] }],
      effects: [{ type: "DROP_SHADOW", visible: true, color: { r: 0, g: 0, b: 0 }, offset: { x: 1, y: 2 }, radius: 4, spread: 0 }],
    };
    const out: SerializedNode = serializeNode(asSceneNode(stub));
    const fills = out["fills"] as Array<{ gradientStops: unknown[] }>;
    expect(fills[0]?.gradientStops).toHaveLength(1);
    expect((out["effects"] as Array<{ type: string }>)[0]?.type).toBe("DROP_SHADOW");
  });

  it("component props error degrades to marker", () => {
    const stub: SceneNodeStub = { id: "5:1", name: "I", type: "INSTANCE", x: 0, y: 0, width: 1, height: 1 };
    Object.defineProperty(stub, "componentProperties", { get() { throw new Error("variant deleted"); } });
    const out: SerializedNode = serializeNode(asSceneNode(stub));
    expect((out["componentProperties"] as { _error: string })._error).toContain("variant");
  });

  it("maxChars budget truncates deep trees", () => {
    const kids = Array.from({ length: 50 }, (_, i) => ({ id: `1:${i}`, name: `K${i}`, type: "RECTANGLE", x: 0, y: 0, width: 100, height: 100, fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] }));
    const stub: SceneNodeStub = { id: "0:9", name: "R", type: "FRAME", x: 0, y: 0, width: 1, height: 1, children: kids };
    const out: SerializedNode = serializeNode(asSceneNode(stub), { depth: -1, maxChars: 1000 });
    expect(out["childrenTruncated"]).toBe(true);
    expect(Number(out["_truncatedCount"])).toBeGreaterThan(0);
  });

  it("fields filter drops children entirely", () => {
    const stub: SceneNodeStub = { id: "0:2", name: "F", type: "FRAME", x: 0, y: 0, width: 1, height: 1, children: [{ id: "1:1", name: "A", type: "RECTANGLE" }] };
    const out: SerializedNode = serializeNode(asSceneNode(stub), { depth: -1, fields: ["geometry"] });
    expect(out["children"]).toBeUndefined();
  });
});
