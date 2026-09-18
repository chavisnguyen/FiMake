import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  asSceneNode,
  getFigma,
  sceneNodeStub,
  setupFigma,
  type MockFigma,
  type SceneNodeStub,
} from "../helpers";

import { createRectangle } from "../../main/tools/create/create-rectangle";
import { createFrame } from "../../main/tools/create/create-frame";
import { createText } from "../../main/tools/create/create-text";
import { createComponent } from "../../main/tools/create/create-component";
import { createInstance } from "../../main/tools/create/create-instance";
import { createImage } from "../../main/tools/create/create-image";
import { cloneNode } from "../../main/tools/create/clone-node";
import { addComponentProperty } from "../../main/tools/create/add-component-property";
import { addPrototypeLink } from "../../main/tools/create/add-prototype-link";
import { getSelection } from "../../main/tools/read/get-selection";
import { getNodeInfo } from "../../main/tools/read/get-node-info";
import { getPages } from "../../main/tools/read/get-pages";
import { getAllComponents } from "../../main/tools/read/get-all-components";
import { exportAsset } from "../../main/tools/read/export-asset";
import { moveNode } from "../../main/tools/update/move-node";
import { resizeNode } from "../../main/tools/update/resize-node";
import { setFillColor } from "../../main/tools/update/set-fill-color";
import { setStrokeColor } from "../../main/tools/update/set-stroke-color";
import { setCornerRadius } from "../../main/tools/update/set-corner-radius";
import { setLayout } from "../../main/tools/update/set-layout";
import { setParentId } from "../../main/tools/update/set-parent-id";
import { setInstanceProperties } from "../../main/tools/update/set-instance-properties";
import { editComponentProperty } from "../../main/tools/update/edit-component-property";
import { setNodeComponentPropertyReferences } from "../../main/tools/update/set-node-component-property-references";
import { deleteNode } from "../../main/tools/delete/delete-node";
import { deleteComponentProperty } from "../../main/tools/delete/delete-component-property";

describe("plugin create tools", () => {
  beforeEach(() => setupFigma());

  it("createRectangle appends to currentPage + errors on missing parent", async () => {
    const rect: SceneNodeStub = { ...sceneNodeStub(), resize: vi.fn() };
    const figma: MockFigma = getFigma();
    figma.createRectangle.mockReturnValue(rect);
    figma.getNodeByIdAsync.mockResolvedValue(null);
    const ok = await createRectangle({ x: 1, y: 2, width: 10, height: 5, name: "R" });
    expect(ok.isError).toBe(false);
    expect(figma.currentPage.appendChild).toHaveBeenCalledWith(rect);
    const err = await createRectangle({ x: 0, y: 0, width: 1, height: 1, name: "R", parentId: "9:9" });
    expect(err).toMatchObject({ isError: true, content: "Parent node not found" });
  });

  it("createFrame appends to parent when found", async () => {
    const frame: SceneNodeStub = { ...sceneNodeStub({ type: "FRAME" }), resize: vi.fn() };
    const parent = { appendChild: vi.fn() };
    const figma: MockFigma = setupFigma();
    figma.createFrame.mockReturnValue(frame);
    figma.getNodeByIdAsync.mockResolvedValue(parent);
    const res = await createFrame({ x: 0, y: 0, width: 5, height: 5, name: "F", parentId: "0:1" });
    expect(res.isError).toBe(false);
    expect(parent.appendChild).toHaveBeenCalledWith(frame);
  });

  it("createText sets fills/font, errors on bad parent + font fail", async () => {
    const figma: MockFigma = setupFigma();
    const text: SceneNodeStub = { id: "2:1", name: "T", type: "TEXT" };
    figma.createText.mockReturnValue(text);
    const ok = await createText({ x: 0, y: 0, text: "hi", fontName: "Inter", fontWeight: 400, fontColor: "#FF0000FF", fontSize: 14, name: "T" });
    expect(ok.isError).toBe(false);
    expect(text["characters"]).toBe("hi");
    figma.getNodeByIdAsync.mockResolvedValue(null);
    const noParent = await createText({ x: 0, y: 0, text: "hi", fontName: "Inter", fontWeight: 400, fontColor: "#FF0000FF", fontSize: 14, name: "T", parentId: "9:9" });
    expect(noParent.isError).toBe(true);
    figma.loadFontAsync.mockRejectedValueOnce(new Error("no font"));
    const badFont = await createText({ x: 0, y: 0, text: "hi", fontName: "Nope", fontWeight: 400, fontColor: "#FF0000FF", fontSize: 14, name: "T" });
    expect(badFont.isError).toBe(true);
    expect(String(badFont.content)).toContain("Nope");
  });

  it("createComponent + cloneNode not-found paths", async () => {
    const figma: MockFigma = setupFigma();
    figma.createComponent.mockReturnValue({ id: "3:1", name: "C", key: "k", componentPropertyDefinitions: {} });
    expect((await createComponent({ name: "C" })).isError).toBe(false);
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await createComponent({ name: "C", parentId: "9:9" })).isError).toBe(true);
    expect((await cloneNode({ id: "9:9" })).isError).toBe(true);
    const src: SceneNodeStub = { ...sceneNodeStub(), clone: vi.fn(() => sceneNodeStub({ id: "1:2" })) };
    figma.getNodeByIdAsync.mockResolvedValue(src);
    expect((await cloneNode({ id: "1:1" })).isError).toBe(false);
  });

  it("createInstance: component missing / parent missing / ok", async () => {
    const figma: MockFigma = setupFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await createInstance({ componentId: "9:9", name: "I", x: 0, y: 0 })).isError).toBe(true);
    const comp = { createInstance: vi.fn(() => ({ name: "", x: 0, y: 0 })) };
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? comp : null));
    expect((await createInstance({ componentId: "1:1", name: "I", x: 0, y: 0, parentId: "9:9" })).content).toBe("Parent node not found");
  });

  it("addComponentProperty validates type + boolean coercion", async () => {
    const figma: MockFigma = setupFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await addComponentProperty({ componentId: "9:9", name: "n", type: "BOOLEAN", defaultValue: "true" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue({ type: "RECTANGLE" });
    expect((await addComponentProperty({ componentId: "1:1", name: "n", type: "BOOLEAN", defaultValue: "true" })).content).toBe("Node is not a component");
    const comp = { type: "COMPONENT", addComponentProperty: vi.fn() };
    figma.getNodeByIdAsync.mockResolvedValue(comp);
    const res = await addComponentProperty({ componentId: "1:1", name: "flag", type: "BOOLEAN", defaultValue: "true" });
    expect(res.isError).toBe(false);
    expect(comp.addComponentProperty).toHaveBeenCalledWith("flag", "BOOLEAN", true);
  });

  it("createImage builds IMAGE rectangle", async () => {
    const figma: MockFigma = setupFigma();
    const rect: SceneNodeStub = { id: "1:1", name: "Img", type: "RECTANGLE", resize: vi.fn() };
    figma.createRectangle.mockReturnValue(rect);
    figma.getNodeByIdAsync.mockResolvedValue({ appendChild: vi.fn() });
    const res = await createImage({ x: 0, y: 0, width: 10, height: 10, name: "Img", url: "https://x", imageData: [1, 2, 3], parentId: "0:1" });
    expect(res.isError).toBe(false);
    expect((rect["fills"] as Array<{ type: string; scaleMode: string }>)[0]).toMatchObject({ type: "IMAGE", scaleMode: "FILL" });
  });

  it("addPrototypeLink validates nodes + builds reaction", async () => {
    const figma: MockFigma = setupFigma();
    const linkParams = { trigger: "ON_CLICK", navigation: "NAVIGATE", transition: "DISSOLVE", duration: 300 } as const;
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await addPrototypeLink({ nodeId: "1:1", destinationId: "2:2", ...linkParams })).content).toBe("Source node not found");
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? { id, name: "A" } : null));
    expect((await addPrototypeLink({ nodeId: "1:1", destinationId: "2:2", ...linkParams })).content).toBe("Destination node not found");
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => ({ id, name: id, type: "FRAME" }));
    expect((await addPrototypeLink({ nodeId: "1:1", destinationId: "2:2", ...linkParams })).content).toContain("does not support reactions");
    const src = { id: "1:1", name: "A", type: "FRAME", reactions: [], setReactionsAsync: vi.fn(async () => {}) };
    const dst = { id: "2:2", name: "B", type: "FRAME" };
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? src : dst));
    const ok = await addPrototypeLink({ nodeId: "1:1", destinationId: "2:2", trigger: "ON_CLICK", navigation: "NAVIGATE", transition: "DISSOLVE", duration: 300 });
    expect(ok.isError).toBe(false);
    expect(src.setReactionsAsync).toHaveBeenCalled();
  });
});

describe("plugin read tools", () => {
  beforeEach(() => setupFigma());
  it("getSelection maps + getNodeInfo not-found", async () => {
    const figma: MockFigma = getFigma();
    figma.currentPage.selection = [asSceneNode({ id: "1:1", name: "A", type: "RECTANGLE", x: 0, y: 0, width: 1, height: 1 })];
    expect((await getSelection()).isError).toBe(false);
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await getNodeInfo({ id: "9:9" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue(sceneNodeStub());
    expect((await getNodeInfo({ id: "1:1", depth: 0 })).isError).toBe(false);
  });
  it("getPages + getAllComponents", async () => {
    const figma: MockFigma = setupFigma();
    figma.root.findAllWithCriteria.mockReturnValue([{ id: "0:1", name: "P", children: [] }]);
    expect((await getPages({})).isError).toBe(false);
    figma.root.findAllWithCriteria.mockReturnValue([]);
    expect((await getAllComponents({})).content).toBe("No components found");
    figma.root.findAllWithCriteria.mockReturnValue([{ id: "3:1", name: "C", key: "k", componentPropertyDefinitions: {} }]);
    expect((await getAllComponents({})).isError).toBe(false);
  });
  it("exportAsset SVG/PNG/errors", async () => {
    const figma: MockFigma = setupFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await exportAsset({ id: "9:9" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", type: "PAGE" });
    expect((await exportAsset({ id: "1:1" })).content).toContain("does not support export");
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", name: "A", exportAsync: vi.fn(async () => "<svg/>") });
    const svg = await exportAsset({ id: "1:1", format: "SVG" });
    expect((svg.content as { mimeType: string }).mimeType).toBe("image/svg+xml");
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", name: "A", exportAsync: vi.fn(async () => new Uint8Array([1])) });
    const png = await exportAsset({ id: "1:1", format: "PNG", scale: 2 });
    expect((png.content as { mimeType: string }).mimeType).toBe("image/png");
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", name: "A", exportAsync: vi.fn(async () => { throw new Error("fail"); }) });
    expect((await exportAsset({ id: "1:1" })).isError).toBe(true);
  });
});

describe("plugin update/delete tools", () => {
  beforeEach(() => setupFigma());
  it("move/resize not-found + ok", async () => {
    const figma: MockFigma = getFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await moveNode({ id: "9:9", x: 1, y: 1 })).isError).toBe(true);
    expect((await resizeNode({ id: "9:9", width: 1, height: 1 })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue({ ...sceneNodeStub(), resize: vi.fn() });
    expect((await moveNode({ id: "1:1", x: 5, y: 6 })).isError).toBe(false);
    expect((await resizeNode({ id: "1:1", width: 5, height: 6 })).isError).toBe(false);
  });
  it("fill/stroke missing-prop + ok", async () => {
    const figma: MockFigma = getFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await setFillColor({ id: "9:9", color: "#FF0000FF" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", type: "PAGE" });
    expect((await setFillColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(true);
    expect((await setStrokeColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue({ ...sceneNodeStub(), fills: [], strokes: [] });
    expect((await setFillColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(false);
    expect((await setStrokeColor({ id: "1:1", color: "#FF0000FF" })).isError).toBe(false);
  });
  it("corner/layout/parent/instance/edit/refs/delete", async () => {
    const figma: MockFigma = setupFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await setCornerRadius({ id: "9:9", cornerRadius: 4 })).isError).toBe(true);
    expect((await setLayout({ id: "9:9", mode: "HORIZONTAL" })).isError).toBe(true);
    expect((await setParentId({ id: "9:9", parentId: "0:1" })).isError).toBe(true);
    expect((await setInstanceProperties({ instanceId: "9:9", properties: {} })).isError).toBe(true);
    expect((await editComponentProperty({ componentId: "9:9", name: "n", type: "TEXT", defaultValue: "d" })).isError).toBe(true);
    expect((await setNodeComponentPropertyReferences({ id: "9:9", componentPropertyReferences: {} })).isError).toBe(true);
    expect((await deleteNode({ id: "9:9" })).isError).toBe(true);
    expect((await deleteComponentProperty({ componentId: "9:9", name: "n" })).isError).toBe(true);

    figma.getNodeByIdAsync.mockResolvedValue({ ...sceneNodeStub(), cornerRadius: 0 });
    expect((await setCornerRadius({ id: "1:1", cornerRadius: 8 })).isError).toBe(false);
    figma.getNodeByIdAsync.mockResolvedValue({ ...sceneNodeStub({ type: "FRAME" }), layoutMode: "NONE", itemSpacing: 0 });
    expect((await setLayout({ id: "1:1", mode: "HORIZONTAL", itemSpacing: 8 })).isError).toBe(false);
    const parent = { appendChild: vi.fn() };
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "9:9" ? null : id === "0:1" ? parent : sceneNodeStub()));
    expect((await setParentId({ id: "1:1", parentId: "0:1" })).isError).toBe(false);

    const inst = { type: "INSTANCE", setProperties: vi.fn(), id: "5:1" };
    figma.getNodeByIdAsync.mockResolvedValue(inst);
    // setInstanceProperties re-fetches then serializes instance
    figma.getNodeByIdAsync.mockImplementation(async () => ({ id: "5:1", name: "I", x: 0, y: 0, parent: null, componentProperties: {} }));
    // need first call to return instance for type check — chain: first INSTANCE, then serializable
    let calls = 0;
    figma.getNodeByIdAsync.mockImplementation(async () => (++calls === 1 ? inst : { id: "5:1", name: "I", x: 0, y: 0, parent: null, componentProperties: {} }));
    expect((await setInstanceProperties({ instanceId: "5:1", properties: { a: 1 } })).isError).toBe(false);

    figma.getNodeByIdAsync.mockResolvedValue({ type: "RECTANGLE" });
    expect((await setInstanceProperties({ instanceId: "1:1", properties: {} })).content).toBe("Node is not an instance");

    const comp = { type: "COMPONENT", editComponentProperty: vi.fn(() => ({})), deleteComponentProperty: vi.fn() };
    figma.getNodeByIdAsync.mockResolvedValue(comp);
    expect((await editComponentProperty({ componentId: "1:1", name: "n", type: "TEXT", defaultValue: "d" })).isError).toBe(false);
    expect((await deleteComponentProperty({ componentId: "1:1", name: "n" })).isError).toBe(false);
    figma.getNodeByIdAsync.mockResolvedValue({ type: "RECTANGLE" });
    expect((await editComponentProperty({ componentId: "1:1", name: "n", type: "TEXT", defaultValue: "d" })).content).toBe("Node is not a component");

    const node: SceneNodeStub = { ...sceneNodeStub() };
    figma.getNodeByIdAsync.mockResolvedValue(node);
    expect((await setNodeComponentPropertyReferences({ id: "1:1", componentPropertyReferences: { characters: "p" } })).isError).toBe(false);
    figma.getNodeByIdAsync.mockResolvedValue({ id: "1:1", name: "N", remove: vi.fn() });
    expect((await deleteNode({ id: "1:1" })).isError).toBe(false);
  });
});
