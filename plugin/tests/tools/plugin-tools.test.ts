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
import { createSvg } from "../../main/tools/create/create-svg";
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
    const text: SceneNodeStub = { id: "2:1", name: "T", type: "TEXT", remove: vi.fn() };
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
    // Both failures removed the node createText had already put on the page.
    expect(text["remove"]).toHaveBeenCalledTimes(2);
  });

  it("createText segments: one node, several styles; mismatch fails", async () => {
    const figma: MockFigma = setupFigma();
    const text: SceneNodeStub = {
      id: "2:2", name: "T", type: "TEXT", remove: vi.fn(),
      setRangeFontName: vi.fn(), setRangeFontSize: vi.fn(), setRangeFills: vi.fn(),
    };
    figma.createText.mockReturnValue(text);
    const base = { x: 0, y: 0, text: "Hi There", fontName: "Inter", fontWeight: 400, fontColor: "#000000FF", fontSize: 14, name: "T" };
    const ok = await createText({
      ...base,
      segments: [
        { text: "Hi ", fontWeight: 700 },
        { text: "There", fontColor: "#888888FF", fontSize: 12 },
      ],
    });
    expect(ok.isError).toBe(false);
    expect(text["setRangeFontName"]).toHaveBeenCalledWith(0, 3, { family: "Inter", style: "Bold" });
    expect(text["setRangeFontSize"]).toHaveBeenCalledWith(3, 8, 12);
    // Segments must concatenate exactly to text.
    const bad = await createText({ ...base, segments: [{ text: "Hi" }] });
    expect(bad.isError).toBe(true);
    expect(String(bad.content)).toContain("concatenate");
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

  it("createInstance: component missing / non-component / parent missing / ok", async () => {
    const figma: MockFigma = setupFigma();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await createInstance({ componentId: "9:9", name: "I", x: 0, y: 0 })).isError).toBe(true);
    // RECTANGLE has no createInstance — must fail with a clear message, not a TypeError.
    figma.getNodeByIdAsync.mockResolvedValue({ type: "RECTANGLE" });
    expect((await createInstance({ componentId: "1:1", name: "I", x: 0, y: 0 })).content).toBe(
      "Node is not a component (createInstance needs a COMPONENT node)"
    );
    // Parent validated BEFORE creating: missing parent leaks nothing and errors.
    const instance = { name: "", x: 0, y: 0 };
    const comp = { type: "COMPONENT", createInstance: vi.fn(() => instance) };
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? comp : null));
    expect((await createInstance({ componentId: "1:1", name: "I", x: 0, y: 0, parentId: "9:9" })).content).toBe("Parent node not found");
    expect(comp.createInstance).not.toHaveBeenCalled();
    // Parent found → appended there; no parentId → current page.
    const parent = { appendChild: vi.fn() };
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? comp : parent));
    expect((await createInstance({ componentId: "1:1", name: "I", x: 0, y: 0, parentId: "0:1" })).isError).toBe(false);
    expect(parent.appendChild).toHaveBeenCalledWith(instance);
    figma.getNodeByIdAsync.mockImplementation(async (id: string) => (id === "1:1" ? comp : null));
    expect((await createInstance({ componentId: "1:1", name: "I", x: 0, y: 0 })).isError).toBe(false);
    expect(figma.currentPage.appendChild).toHaveBeenCalledWith(instance);
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
    // "false" must stay false — Boolean("false") === true would flip the default.
    await addComponentProperty({ componentId: "1:1", name: "off", type: "BOOLEAN", defaultValue: "false" });
    expect(comp.addComponentProperty).toHaveBeenCalledWith("off", "BOOLEAN", false);
    // COMPONENT_SET carries definitions too (ComponentPropertiesMixin) — allowed.
    const set = { type: "COMPONENT_SET", addComponentProperty: vi.fn() };
    figma.getNodeByIdAsync.mockResolvedValue(set);
    expect((await addComponentProperty({ componentId: "1:1", name: "n", type: "TEXT", defaultValue: "x" })).isError).toBe(false);
  });

  it("createImage builds IMAGE rectangle", async () => {
    const figma: MockFigma = setupFigma();
    const rect: SceneNodeStub = { id: "1:1", name: "Img", type: "RECTANGLE", resize: vi.fn() };
    figma.createRectangle.mockReturnValue(rect);
    figma.getNodeByIdAsync.mockResolvedValue({ appendChild: vi.fn() });
    const res = await createImage({ x: 0, y: 0, width: 10, height: 10, name: "Img", url: "https://x", imageData: "AQID", parentId: "0:1" });
    expect(res.isError).toBe(false);
    expect((rect["fills"] as Array<{ type: string; scaleMode: string }>)[0]).toMatchObject({ type: "IMAGE", scaleMode: "FILL" });
    // No parentId → current page (previously detached + invisible on success).
    const rect2: SceneNodeStub = { id: "1:2", name: "Img2", type: "RECTANGLE", resize: vi.fn() };
    figma.createRectangle.mockReturnValue(rect2);
    expect((await createImage({ x: 0, y: 0, width: 10, height: 10, name: "Img2", url: "https://x", imageData: "AQID" })).isError).toBe(false);
    expect(figma.currentPage.appendChild).toHaveBeenCalledWith(rect2);
    // Missing parent → loud error, node cleaned up (no invisible success).
    figma.getNodeByIdAsync.mockResolvedValue(null);
    const rect3: SceneNodeStub = { id: "1:3", name: "Img3", type: "RECTANGLE", resize: vi.fn(), remove: vi.fn() };
    figma.createRectangle.mockReturnValue(rect3);
    expect((await createImage({ x: 0, y: 0, width: 10, height: 10, name: "Img3", url: "https://x", imageData: "AQID", parentId: "9:9" })).isError).toBe(true);
    expect(rect3["remove"]).toHaveBeenCalled();
  });

  it("createSvg places the vector frame, re-parents, cleans up on bad parent, reports invalid SVG", async () => {
    const figma: MockFigma = setupFigma();
    const svgFrame: SceneNodeStub = { ...sceneNodeStub({ id: "5:1", type: "FRAME" }), remove: vi.fn() };
    figma.createNodeFromSvg.mockReturnValue(svgFrame);
    const ok = await createSvg({ svg: "<svg/>", name: "Icon", x: 3, y: 4 });
    expect(ok.isError).toBe(false);
    expect(figma.createNodeFromSvg).toHaveBeenCalledWith("<svg/>");
    expect(svgFrame).toMatchObject({ name: "Icon", x: 3, y: 4 });
    expect(figma.currentPage.appendChild).toHaveBeenCalledWith(svgFrame);

    const parent = { appendChild: vi.fn() };
    figma.getNodeByIdAsync.mockResolvedValue(parent);
    expect((await createSvg({ svg: "<svg/>", name: "Icon", x: 0, y: 0, parentId: "0:1" })).isError).toBe(false);
    expect(parent.appendChild).toHaveBeenCalledWith(svgFrame);

    figma.getNodeByIdAsync.mockResolvedValue(null);
    const noParent = await createSvg({ svg: "<svg/>", name: "Icon", x: 0, y: 0, parentId: "9:9" });
    expect(noParent).toMatchObject({ isError: true, content: "Parent node not found" });
    expect(svgFrame["remove"]).toHaveBeenCalled();

    figma.createNodeFromSvg.mockImplementation(() => {
      throw new Error("parse error");
    });
    const bad = await createSvg({ svg: "<svg", name: "Icon", x: 0, y: 0 });
    expect(bad.isError).toBe(true);
    expect(String(bad.content)).toContain("Invalid SVG");
    expect((await createSvg({ name: "Icon", x: 0, y: 0 })).isError).toBe(true);
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
    // Empty array is truthy — must report empty, not success with [].
    figma.currentPage.selection = [];
    expect(await getSelection()).toMatchObject({ isError: true, content: "Selection is empty" });
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await getNodeInfo({ id: "9:9" })).isError).toBe(true);
    figma.getNodeByIdAsync.mockResolvedValue(sceneNodeStub());
    expect((await getNodeInfo({ id: "1:1", depth: 0 })).isError).toBe(false);
  });
  it("getPages + getAllComponents", async () => {
    const figma: MockFigma = setupFigma();
    // Pages are figma.root.children (no full-file findAll).
    (figma.root as unknown as { children: unknown[] }).children = [{ id: "0:1", name: "P", children: [] }];
    expect((await getPages({})).isError).toBe(false);
    figma.root.findAllWithCriteria.mockReturnValue([]);
    expect((await getAllComponents({})).content).toBe("No components found");
    figma.root.findAllWithCriteria.mockReturnValue([{ id: "3:1", name: "C", key: "k", componentPropertyDefinitions: {} }]);
    expect((await getAllComponents({})).isError).toBe(false);
  });
  it("findNodesByName matches substring/exact, caps at limit", async () => {
    const { findNodesByName } = await import("../../main/tools/read/find-nodes-by-name");
    const figma: MockFigma = setupFigma();
    const kids = [
      { id: "1:1", name: "Buy Button", type: "RECTANGLE" },
      { id: "1:2", name: "buy caption", type: "TEXT" },
      { id: "1:3", name: "Hero", type: "FRAME" },
    ];
    (figma.root as unknown as { children: unknown[] }).children = [
      { id: "0:1", name: "Page 1", type: "PAGE", findAll: (pred: (n: { name: string }) => boolean) => kids.filter((k) => pred(k)) },
    ];
    const sub = await findNodesByName({ name: "buy" });
    expect(sub.isError).toBe(false);
    expect(sub.content).toEqual([
      { id: "1:1", name: "Buy Button", type: "RECTANGLE", pageId: "0:1", pageName: "Page 1" },
      { id: "1:2", name: "buy caption", type: "TEXT", pageId: "0:1", pageName: "Page 1" },
    ]);
    const exact = await findNodesByName({ name: "buy", exact: true });
    expect(exact).toMatchObject({ isError: true });
    const capped = await findNodesByName({ name: "buy", limit: 1 });
    expect((capped.content as unknown[])).toHaveLength(1);
    const miss = await findNodesByName({ name: "zzz-nope" });
    expect(miss.isError).toBe(true);
  });
  it("get-design-audit flags empty/zero/default/hidden/low-contrast", async () => {
    const { getDesignAudit } = await import("../../main/tools/read/get-design-audit");
    const figma: MockFigma = setupFigma();
    const solid = (r: number, g: number, b: number) => [{ type: "SOLID", color: { r, g, b } }];
    const frame = {
      id: "0:1", name: "Card", type: "FRAME", visible: true, width: 300, height: 200, fills: solid(1, 1, 1),
      children: [
        { id: "1:1", name: "Title", type: "TEXT", visible: true, width: 200, height: 20, characters: "Hi", fills: solid(0.2, 0.2, 0.2) },
        { id: "1:2", name: "Sub", type: "TEXT", visible: true, width: 200, height: 20, characters: "", fills: solid(0, 0, 0) },
        { id: "1:3", name: "Rectangle 12", type: "RECTANGLE", visible: true, width: 0, height: 10, fills: solid(1, 0, 0) },
        { id: "1:4", name: "Pale", type: "TEXT", visible: true, width: 200, height: 20, characters: "yo", fills: solid(0.85, 0.85, 0.85) },
        { id: "1:5", name: "Gone", type: "TEXT", visible: false, width: 10, height: 10, characters: "x", fills: solid(0, 0, 0) },
      ],
    };
    figma.getNodeByIdAsync.mockResolvedValue(frame);
    const res = await getDesignAudit({ id: "0:1" });
    expect(res.isError).toBe(false);
    const body = res.content as { issues: Array<{ nodeId: string; check: string }> };
    const byId = Object.fromEntries(body.issues.map((i) => [i.nodeId, i.check]));
    expect(byId["1:2"]).toBe("empty-text");
    // 1:3 is both zero-size and default-named — one issue per check.
    expect(body.issues.filter((i) => i.nodeId === "1:3").map((i) => i.check).sort()).toEqual(["default-name", "zero-size"]);
    expect(byId["1:4"]).toBe("low-contrast");
    expect(byId["1:5"]).toBe("hidden");
    expect(JSON.stringify(body.issues)).toContain("Rectangle 12");
    expect(body.issues.find((i) => i.nodeId === "1:1")).toBeUndefined();
    figma.getNodeByIdAsync.mockResolvedValue(null);
    expect((await getDesignAudit({ id: "9:9" })).isError).toBe(true);
  });
  it("getAllComponents survives variant components (real-file crash)", async () => {
    const figma: MockFigma = setupFigma();
    // Variant thật trong Figma throw khi đọc getter này — message copy từ
    // data thật record được (Design System & Components page).
    const variant = {
      id: "3:2",
      name: "V",
      key: "k2",
      get componentPropertyDefinitions(): unknown {
        throw new Error(
          "in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component",
        );
      },
    };
    figma.root.findAllWithCriteria.mockReturnValue([
      { id: "3:1", name: "C", key: "k", componentPropertyDefinitions: {} },
      variant,
    ]);
    const res = await getAllComponents({});
    expect(res.isError).toBe(false);
    const list = res.content as { id: string; properties: unknown }[];
    expect(list).toHaveLength(2);
    expect(list[1]?.id).toBe("3:2");
    expect(JSON.stringify(list[1]?.properties)).toContain("non-variant component");
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
