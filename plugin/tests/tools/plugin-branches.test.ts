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
});
