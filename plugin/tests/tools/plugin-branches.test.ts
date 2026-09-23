import { describe, it, expect, beforeEach, vi } from "vitest";
import { getFigma, setupFigma, type MockFigma, type SceneNodeStub } from "../helpers";
import type { ToolResult } from "../../main/tools/tool-result";

import { editComponentProperty } from "../../main/tools/update/edit-component-property";
import { deleteComponentProperty } from "../../main/tools/delete/delete-component-property";
import { setInstanceProperties } from "../../main/tools/update/set-instance-properties";
import { setCornerRadius } from "../../main/tools/update/set-corner-radius";
import { setLayout } from "../../main/tools/update/set-layout";
import { setFillColor } from "../../main/tools/update/set-fill-color";
import { setStrokeColor } from "../../main/tools/update/set-stroke-color";
import { setParentId } from "../../main/tools/update/set-parent-id";
import { setEffects } from "../../main/tools/update/set-effects";

describe("plugin branch coverage fill", () => {
  beforeEach(() => setupFigma());

  it("editComponentProperty INSTANCE_SWAP requires preferredValues + maps keys", async () => {
    const figma: MockFigma = getFigma();
    const comp = { type: "COMPONENT", editComponentProperty: vi.fn(() => ({})) };
    figma.getNodeByIdAsync.mockResolvedValue(comp);
    const missing: ToolResult = await editComponentProperty({ componentId: "1:1", name: "n", type: "INSTANCE_SWAP", defaultValue: "d" });
    expect(missing.isError).toBe(true);
    const ok: ToolResult = await editComponentProperty({ componentId: "1:1", name: "n", type: "INSTANCE_SWAP", defaultValue: "d", preferredValues: ["k1"] });
    expect(ok.isError).toBe(false);
    expect(comp.editComponentProperty).toHaveBeenCalledWith("n", expect.objectContaining({ preferredValues: [{ type: "COMPONENT", key: "k1" }] }));
  });

  it("editComponentProperty TEXT omits preferredValues + resolves short name", async () => {
    const figma: MockFigma = getFigma();
    const comp = {
      type: "COMPONENT",
      componentPropertyDefinitions: { "Label#1:2": { type: "TEXT", defaultValue: "hi" } },
      editComponentProperty: vi.fn(() => ({})),
    };
    figma.getNodeByIdAsync.mockResolvedValue(comp);
    const res: ToolResult = await editComponentProperty({ componentId: "1:1", name: "Label", type: "TEXT", defaultValue: "hey" });
    expect(res.isError).toBe(false);
    // Full key resolved + no preferredValues (Figma rejects even [] for TEXT).
    expect(comp.editComponentProperty).toHaveBeenCalledWith("Label#1:2", { name: "Label", defaultValue: "hey" });
  });

  it("deleteComponentProperty resolves short name to full key", async () => {
    const figma: MockFigma = getFigma();
    const comp = {
      type: "COMPONENT",
      componentPropertyDefinitions: { "Label#1:2": { type: "TEXT", defaultValue: "hi" } },
      deleteComponentProperty: vi.fn(),
    };
    figma.getNodeByIdAsync.mockResolvedValue(comp);
    const res: ToolResult = await deleteComponentProperty({ componentId: "1:1", name: "Label" });
    expect(res.isError).toBe(false);
    expect(comp.deleteComponentProperty).toHaveBeenCalledWith("Label#1:2");
  });

  it("setInstanceProperties resolves short names via mainComponent", async () => {
    const figma: MockFigma = getFigma();
    const inst = {
      type: "INSTANCE",
      // Sync mainComponent throws under dynamic-page access — impl must use
      // getMainComponentAsync (mirrors the real Figma crash).
      get mainComponent(): never {
        throw new Error("in get_mainComponent: Cannot call with documentAccess: dynamic-page.");
      },
      getMainComponentAsync: vi.fn(async () => ({
        componentPropertyDefinitions: { "Label#1:2": { type: "TEXT", defaultValue: "hi" } },
      })),
      setProperties: vi.fn(),
    };
    figma.getNodeByIdAsync.mockResolvedValue(inst);
    const res: ToolResult = await setInstanceProperties({ instanceId: "4:1", properties: { Label: "hello" } });
    expect(res.isError).toBe(false);
    expect(inst.setProperties).toHaveBeenCalledWith({ "Label#1:2": "hello" });
  });

  it("setCornerRadius per-side radii", async () => {
    const figma: MockFigma = getFigma();
    const node: SceneNodeStub = { id: "1:1", name: "N", type: "RECTANGLE", x: 0, y: 0, width: 1, height: 1, cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0 };
    figma.getNodeByIdAsync.mockResolvedValue(node);
    const res: ToolResult = await setCornerRadius({ id: "1:1", cornerRadius: 4, topLeftRadius: 1, topRightRadius: 2, bottomLeftRadius: 3, bottomRightRadius: 4 });
    expect(res.isError).toBe(false);
    expect(node["topLeftRadius"]).toBe(1);
    expect(node["bottomRightRadius"]).toBe(4);
  });

  it("setLayout returns errorMessage when props missing", async () => {
    const figma: MockFigma = getFigma();
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", name: "N", type: "RECTANGLE", x: 0, y: 0, width: 1, height: 1 });
    const res: ToolResult = await setLayout({ id: "1:1", mode: "HORIZONTAL", paddingLeft: 8 });
    expect(res.isError).toBe(true);
    expect(String(res.content)).toContain("paddingLeft");
  });

  it("setLayout wrap/clip/sizing branches", async () => {
    const figma: MockFigma = getFigma();
    const node: SceneNodeStub = { id: "1:1", name: "F", type: "FRAME", x: 0, y: 0, width: 1, height: 1, layoutMode: "NONE", layoutWrap: "NO_WRAP", clipContent: false, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED" };
    figma.getNodeByIdAsync.mockResolvedValue(node);
    const res: ToolResult = await setLayout({ id: "1:1", mode: "NONE", wrap: true, clip: true, layoutSizingHorizontal: "FILL", layoutSizingVertical: "HUG" });
    expect(res.isError).toBe(false);
    expect(node["layoutWrap"]).toBe("WRAP");
  });

  it("setLayout keeps a FIXED frame's size when turning auto-layout on (Figma defaults to HUG)", async () => {
    const figma: MockFigma = getFigma();
    const makeFrame = (): SceneNodeStub => {
      const node: SceneNodeStub = {
        id: "1:1", name: "navbar", type: "FRAME", x: 0, y: 0, width: 1440, height: 80,
        itemSpacing: 0, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED",
        resize: vi.fn((w: number, h: number) => { node["width"] = w; node["height"] = h; }),
      };
      let mode = "NONE";
      // Mirror real Figma: enabling auto-layout switches both axes to HUG and shrinks to content.
      Object.defineProperty(node, "layoutMode", {
        enumerable: true,
        get: () => mode,
        set: (v: string) => {
          if (mode === "NONE" && v !== "NONE") {
            node["layoutSizingHorizontal"] = "HUG";
            node["layoutSizingVertical"] = "HUG";
            node["width"] = 100;
            node["height"] = 20;
          }
          mode = v;
        },
      });
      return node;
    };

    const kept = makeFrame();
    figma.getNodeByIdAsync.mockResolvedValue(kept);
    expect((await setLayout({ id: "1:1", mode: "HORIZONTAL", itemSpacing: 8 })).isError).toBe(false);
    expect(kept).toMatchObject({ width: 1440, height: 80, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED" });

    const hug = makeFrame();
    figma.getNodeByIdAsync.mockResolvedValue(hug);
    await setLayout({ id: "1:1", mode: "HORIZONTAL", layoutSizingHorizontal: "HUG" });
    expect(hug).toMatchObject({ layoutSizingHorizontal: "HUG", layoutSizingVertical: "FIXED" });
    expect(hug["resize"]).not.toHaveBeenCalled();

    const already = makeFrame();
    already["layoutMode"] = "VERTICAL";
    (already["resize"] as ReturnType<typeof vi.fn>).mockClear();
    figma.getNodeByIdAsync.mockResolvedValue(already);
    await setLayout({ id: "1:1", mode: "VERTICAL", itemSpacing: 4 });
    expect(already).toMatchObject({ layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG" });
    expect(already["resize"]).not.toHaveBeenCalled();
  });

  it("setFill/setStroke catch + parent-not-found", async () => {
    const figma: MockFigma = getFigma();
    const bad: SceneNodeStub = { id: "1:1", name: "N", type: "RECTANGLE" };
    Object.defineProperty(bad, "fills", { set() { throw new Error("locked"); } });
    figma.getNodeByIdAsync.mockResolvedValue(bad);
    expect((await setFillColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(true);
    const bad2: SceneNodeStub = { id: "1:1", name: "N", type: "RECTANGLE" };
    Object.defineProperty(bad2, "strokes", { set() { throw new Error("locked"); } });
    figma.getNodeByIdAsync.mockResolvedValue(bad2);
    expect((await setStrokeColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? { id } : null));
    expect((await setParentId({ id: "1:1", parentId: "9:9" })).content).toBe("Parent node not found");
  });

  it("setStrokeColor applies weight/align only when given", async () => {
    const figma: MockFigma = getFigma();
    const node: SceneNodeStub = { id: "1:1", name: "Email", type: "FRAME", strokes: [], strokeWeight: 3, strokeAlign: "CENTER" };
    figma.getNodeByIdAsync.mockResolvedValue(node);
    await setStrokeColor({ id: "1:1", color: "#80808080" });
    expect(node).toMatchObject({ strokeWeight: 3, strokeAlign: "CENTER" });
    await setStrokeColor({ id: "1:1", color: "#80808080", weight: 1, align: "INSIDE" });
    expect(node).toMatchObject({ strokeWeight: 1, strokeAlign: "INSIDE" });
    expect((node["strokes"] as Array<{ opacity: number }>)[0]?.opacity).toBeCloseTo(128 / 255);
  });

  it("setEffects replaces all effects with Figma structs, [] clears, rejects nodes without effects", async () => {
    const figma: MockFigma = getFigma();
    const node: SceneNodeStub = { id: "1:1", name: "Button", type: "FRAME", effects: [{ type: "LAYER_BLUR", radius: 1, visible: true }] };
    figma.getNodeByIdAsync.mockResolvedValue(node);
    const res = await setEffects({
      id: "1:1",
      effects: [
        { type: "DROP_SHADOW", color: "#00000040", offset: { x: 0, y: 2 }, radius: 6, spread: 1 },
        { type: "BACKGROUND_BLUR", radius: 12 },
      ],
    });
    expect(res.isError).toBe(false);
    const fx = node["effects"] as Array<Record<string, unknown>>;
    expect(fx).toHaveLength(2);
    expect(fx[0]).toMatchObject({ type: "DROP_SHADOW", offset: { x: 0, y: 2 }, radius: 6, spread: 1, visible: true, blendMode: "NORMAL" });
    expect((fx[0]?.["color"] as { a: number }).a).toBeCloseTo(64 / 255);
    expect(fx[1]).toEqual({ type: "BACKGROUND_BLUR", radius: 12, visible: true, blurType: "NORMAL" });

    await setEffects({ id: "1:1", effects: [] });
    expect(node["effects"]).toEqual([]);

    figma.getNodeByIdAsync.mockResolvedValue({ id: "0:1", name: "Page", type: "PAGE" });
    const bad = await setEffects({ id: "0:1", effects: [] });
    expect(bad.isError).toBe(true);
    expect(String(bad.content)).toContain("effects");
  });

  describe("setParentId index + absolute", () => {
    type Kid = SceneNodeStub & { parent: { id: string } | null };
    function scene(layoutMode = "HORIZONTAL"): { parent: SceneNodeStub; kids: Kid[]; order: () => string[] } {
      const kids: Kid[] = [];
      const parent: SceneNodeStub = { id: "0:1", name: "Row", type: "FRAME", layoutMode, children: kids };
      const detach = (k: Kid): void => {
        const i = kids.indexOf(k);
        if (i >= 0) kids.splice(i, 1);
      };
      parent["appendChild"] = vi.fn((k: Kid) => { detach(k); kids.push(k); k.parent = { id: parent.id }; });
      // Mirrors real Figma (verified 2026-09-23): the index counts the node's old slot,
      // i.e. insert first, then drop the original occurrence.
      parent["insertChild"] = vi.fn((i: number, k: Kid) => {
        const cur = kids.indexOf(k);
        kids.splice(i, 0, k);
        if (cur >= 0) kids.splice(cur < i ? cur : cur + 1, 1);
        k.parent = { id: parent.id };
      });
      for (const id of ["1:1", "1:2", "1:3"]) kids.push({ id, name: id, type: "RECTANGLE", parent: { id: parent.id } });
      const outsider: Kid = { id: "2:1", name: "bg", type: "RECTANGLE", parent: null };
      getFigma().getNodeByIdAsync.mockImplementation(async (id: string) =>
        id === parent.id ? parent : id === outsider.id ? outsider : kids.find((k) => k.id === id) ?? null);
      return { parent, kids, order: () => kids.map((k) => k.id) };
    }

    it("reorders within the same parent and inserts a new child at an index", async () => {
      const { order } = scene();
      expect((await setParentId({ id: "1:3", parentId: "0:1", index: 0 })).isError).toBe(false);
      expect(order()).toEqual(["1:3", "1:1", "1:2"]);
      // `index` is the final position, also when moving later in the same parent.
      await setParentId({ id: "1:3", parentId: "0:1", index: 2 });
      expect(order()).toEqual(["1:1", "1:2", "1:3"]);
      await setParentId({ id: "1:1", parentId: "0:1", index: 1 });
      expect(order()).toEqual(["1:2", "1:1", "1:3"]);
      await setParentId({ id: "1:2", parentId: "0:1", index: 0 });
      expect(order()).toEqual(["1:2", "1:1", "1:3"]);
      await setParentId({ id: "1:3", parentId: "0:1", index: 0 });
      expect((await setParentId({ id: "2:1", parentId: "0:1", index: 0 })).isError).toBe(false);
      expect(order()).toEqual(["2:1", "1:3", "1:2", "1:1"]);
      await setParentId({ id: "1:2", parentId: "0:1" });
      expect(order()).toEqual(["2:1", "1:3", "1:1", "1:2"]);
    });

    it("rejects out-of-range index (same parent max = length-1, new parent max = length) without moving", async () => {
      const { order } = scene();
      expect((await setParentId({ id: "1:1", parentId: "0:1", index: 3 })).content).toBe("index out of range (0..2)");
      expect((await setParentId({ id: "2:1", parentId: "0:1", index: 4 })).content).toBe("index out of range (0..3)");
      expect((await setParentId({ id: "2:1", parentId: "0:1", index: 3 })).isError).toBe(false);
      expect(order()).toEqual(["1:1", "1:2", "1:3", "2:1"]);
    });

    it("absolute toggles layoutPositioning, requires an auto-layout parent", async () => {
      const { kids } = scene();
      await setParentId({ id: "1:1", parentId: "0:1", absolute: true });
      expect(kids.find((k) => k.id === "1:1")?.["layoutPositioning"]).toBe("ABSOLUTE");
      await setParentId({ id: "1:1", parentId: "0:1", absolute: false });
      expect(kids.find((k) => k.id === "1:1")?.["layoutPositioning"]).toBe("AUTO");

      const flat = scene("NONE");
      const res = await setParentId({ id: "2:1", parentId: "0:1", absolute: true, index: 0 });
      expect(res.isError).toBe(true);
      expect(String(res.content)).toContain("auto-layout parent");
      expect(flat.order()).toEqual(["1:1", "1:2", "1:3"]);
    });
  });
});
