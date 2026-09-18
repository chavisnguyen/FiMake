import { describe, it, expect, beforeAll } from "vitest";
import { serializeRectangle } from "../../main/serialization/serialize-rectangle";
import { serializeText } from "../../main/serialization/serialize-text";
import { serializeFrame } from "../../main/serialization/serialize-frame";
import { serializeSceneNode } from "../../main/serialization/serialize-scene-node";
import { serializePage } from "../../main/serialization/serialize-page";
import { serializeComponent } from "../../main/serialization/serialize-component";
import { serializeInstance } from "../../main/serialization/serialize-instance";
import {
  asSceneNode,
  setupFigma,
  solidPaint,
  type SceneNodeStub,
} from "../helpers";

beforeAll(() => {
  setupFigma();
});

function rectStub(overrides: Partial<SceneNodeStub> = {}): SceneNodeStub {
  return {
    id: "1:1",
    name: "R",
    type: "RECTANGLE",
    x: 1,
    y: 2,
    width: 10,
    height: 5,
    ...overrides,
  };
}

describe("serializeRectangle / SceneNode / Frame", () => {
  it("includes parent id:type", () => {
    const stub = rectStub({ parent: { id: "0:1", type: "PAGE" } });
    expect(serializeRectangle(asSceneNode(stub) as RectangleNode).parentId).toBe("0:1:PAGE");
    expect(serializeSceneNode(asSceneNode(stub)).id).toBe("1:1");
    expect(serializeFrame(asSceneNode(stub) as FrameNode).id).toBe("1:1");
  });
  it("omits parentId when no parent", () => {
    const stub = rectStub({ x: 0, y: 0, width: 1, height: 1, parent: null });
    expect(serializeRectangle(asSceneNode(stub) as RectangleNode).parentId).toBeUndefined();
  });
});

describe("serializeText", () => {
  it("exposes first solid fill as hex fontColor", () => {
    const stub: SceneNodeStub = {
      id: "2:1", name: "T", type: "TEXT", x: 0, y: 0, width: 10, height: 10,
      fontSize: 14,
      fontName: { family: "Inter", style: "Regular" },
      fills: [solidPaint({ r: 0, g: 0, b: 0 })],
      parent: null,
    };
    const out = serializeText(asSceneNode(stub) as TextNode);
    expect(out.fontSize).toBe(14);
    expect(out.fontColor).toMatch(/^#/);
  });
});

describe("serializePage / Component / Instance", () => {
  it("page maps children via serializeNode", () => {
    const stub: SceneNodeStub = {
      id: "0:1", name: "P", type: "PAGE",
      children: [{ id: "1:1", name: "A", type: "RECTANGLE", x: 0, y: 0, width: 1, height: 1 }],
    };
    const out = serializePage(asSceneNode(stub) as unknown as PageNode);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]?.id).toBe("1:1");
  });
  it("component includes key + properties", () => {
    const stub: SceneNodeStub = { id: "3:1", name: "C", type: "COMPONENT", key: "k", componentPropertyDefinitions: { p: 1 } };
    expect(serializeComponent(asSceneNode(stub) as ComponentNode).key).toBe("k");
  });
  it("instance includes properties + parent id", () => {
    const stub: SceneNodeStub = {
      id: "4:1", name: "I", type: "INSTANCE", x: 0, y: 0,
      parent: { id: "0:1" }, componentProperties: { a: { value: 1 } },
    };
    const out = serializeInstance(asSceneNode(stub) as InstanceNode);
    expect(out.parentId).toBe("0:1");
    expect((out.properties as { a: { value: number } }).a.value).toBe(1);
  });
});
