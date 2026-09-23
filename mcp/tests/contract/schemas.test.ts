import { describe, it, expect } from "vitest";
import { CreateRectangleParamsSchema } from "../../src/shared/types/params/create/create-rectangle";
import { CreateFrameParamsSchema } from "../../src/shared/types/params/create/create-frame";
import { CreateTextParamsSchema } from "../../src/shared/types/params/create/create-text";
import { CreateInstanceParamsSchema } from "../../src/shared/types/params/create/create-instance";
import { CreateComponentParamsSchema } from "../../src/shared/types/params/create/create-component";
import { CreateImageParamsSchema } from "../../src/shared/types/params/create/create-image";
import { CreateSvgParamsSchema } from "../../src/shared/types/params/create/create-svg";
import { CloneNodeParamsSchema } from "../../src/shared/types/params/create/clone-node";
import { AddComponentPropertyParamsSchema } from "../../src/shared/types/params/create/add-component-property";
import { AddPrototypeLinkParamsSchema } from "../../src/shared/types/params/create/add-prototype-link";
import { GetNodeInfoParamsSchema } from "../../src/shared/types/params/read/get-node-info";
import { GetPagesParamsSchema } from "../../src/shared/types/params/read/get-pages";
import { GetAllComponentsParamsSchema } from "../../src/shared/types/params/read/get-all-components";
import { ExportAssetParamsSchema } from "../../src/shared/types/params/read/export-asset";
import { ExportFileParamsSchema } from "../../src/shared/types/params/read/export-file";
import { DeleteNodeParamsSchema } from "../../src/shared/types/params/delete/delete-node";
import { DeleteComponentPropertyParamsSchema } from "../../src/shared/types/params/delete/delete-component-property";
import { MoveNodeParamsSchema } from "../../src/shared/types/params/update/move-node";
import { ResizeNodeParamsSchema } from "../../src/shared/types/params/update/resize-node";
import { SetFillColorParamsSchema } from "../../src/shared/types/params/update/set-fill-color";
import { SetStrokeColorParamsSchema } from "../../src/shared/types/params/update/set-stroke-color";
import { SetEffectsParamsSchema } from "../../src/shared/types/params/update/set-effects";
import { SetFillGradientParamsSchema } from "../../src/shared/types/params/update/set-fill-gradient";
import { SetImageFillParamsSchema } from "../../src/shared/types/params/update/set-image-fill";
import { SetCornerRadiusParamsSchema } from "../../src/shared/types/params/update/set-corner-radius";
import { SetLayoutParamsSchema } from "../../src/shared/types/params/update/set-layout";
import { SetParentIdParamsSchema } from "../../src/shared/types/params/update/set-parent-id";
import { SetInstancePropertiesParamsSchema } from "../../src/shared/types/params/update/set-instance-properties";
import { SetNodeComponentPropertyReferencesParamsSchema } from "../../src/shared/types/params/update/set-node-component-property-references";
import { EditComponentPropertyParamsSchema } from "../../src/shared/types/params/update/edit-component-property";
import { ColorHexSchema } from "../../src/shared/types/params/shared/color-hex";

describe("create schemas", () => {
  it("rectangle: defaults name, rejects missing dims", () => {
    expect(CreateRectangleParamsSchema.parse({ x: 0, y: 0, width: 10, height: 5 }).name).toBe("Rectangle");
    expect(() => CreateRectangleParamsSchema.parse({ x: 0, y: 0 })).toThrow();
    expect(() => CreateRectangleParamsSchema.parse({ x: 0, y: 0, width: 1, height: 1, parentId: "bad" })).toThrow();
  });
  it("frame: defaults + parent regex", () => {
    expect(CreateFrameParamsSchema.parse({ x: 0, y: 0, width: 1, height: 1 }).name).toBe("Frame");
    expect(() => CreateFrameParamsSchema.parse({ x: 0, y: 0, width: 1, height: 1, parentId: "1:2" })).not.toThrow();
  });
  it("text: defaults font + color", () => {
    const p = CreateTextParamsSchema.parse({ x: 0, y: 0, text: "hi" });
    expect(p.fontSize).toBe(14);
    expect(p.fontName).toBe("Inter");
    expect(p.fontColor).toBe("#000000FF");
    expect(() => CreateTextParamsSchema.parse({ x: 0, y: 0, text: "hi", fontColor: "#fff" })).toThrow();
  });
  it("instance/component/image/clone", () => {
    expect(CreateInstanceParamsSchema.parse({ componentId: "1:1" }).name).toBe("Instance");
    expect(CreateComponentParamsSchema.parse({ name: "C" }).name).toBe("C");
    expect(CreateImageParamsSchema.parse({ url: "https://x/y.png" }).width).toBe(100);
    expect(() => CreateImageParamsSchema.parse({})).toThrow();
    expect(() => CloneNodeParamsSchema.parse({ id: "1:2" })).not.toThrow();
    expect(() => CloneNodeParamsSchema.parse({ id: "nope" })).toThrow();
  });
  it("svg: defaults placement, keeps svg (plugin strips unknown keys), rejects bad parent", () => {
    const p = CreateSvgParamsSchema.parse({ svg: "<svg/>" });
    expect(p).toMatchObject({ svg: "<svg/>", name: "SVG", x: 0, y: 0 });
    expect(() => CreateSvgParamsSchema.parse({ svg: "<svg/>", parentId: "bad" })).toThrow();
  });
  it("add-component-property enum + prototype-link defaults", () => {
    expect(() => AddComponentPropertyParamsSchema.parse({ componentId: "1:1", name: "n", type: "BOOLEAN", defaultValue: "true" })).not.toThrow();
    expect(() => AddComponentPropertyParamsSchema.parse({ componentId: "1:1", name: "n", type: "NOPE", defaultValue: "x" })).toThrow();
    const link = AddPrototypeLinkParamsSchema.parse({ nodeId: "1:1", destinationId: "2:2" });
    expect(link.trigger).toBe("ON_CLICK");
    expect(link.duration).toBe(300);
    expect(() => AddPrototypeLinkParamsSchema.parse({ nodeId: "bad", destinationId: "2:2" })).toThrow();
  });
});

describe("read schemas", () => {
  it("get-node-info: depth/budgets bounds", () => {
    expect(GetNodeInfoParamsSchema.parse({ id: "1:1" }).id).toBe("1:1");
    expect(GetNodeInfoParamsSchema.parse({ id: "1:1", depth: -1 }).depth).toBe(-1);
    expect(GetNodeInfoParamsSchema.parse({ id: "1:1", depth: "-1" }).depth).toBe(-1); // coerce
    expect(() => GetNodeInfoParamsSchema.parse({ id: "1:1", depth: -2 })).toThrow();
    expect(() => GetNodeInfoParamsSchema.parse({ id: "1:1", maxNodes: 0 })).toThrow();
    expect(() => GetNodeInfoParamsSchema.parse({ id: "1:1", maxChars: 999 })).toThrow();
    expect(() => GetNodeInfoParamsSchema.parse({})).toThrow();
  });
  it("get-pages / get-all-components accept {}", () => {
    expect(GetPagesParamsSchema.parse({})).toEqual({});
    expect(GetAllComponentsParamsSchema.parse({})).toEqual({});
  });
  it("export-asset: format/scale bounds", () => {
    expect(ExportAssetParamsSchema.parse({ id: "1:1" }).id).toBe("1:1");
    expect(ExportAssetParamsSchema.parse({ id: "1:1", format: "PNG", scale: "2" }).scale).toBe(2);
    expect(() => ExportAssetParamsSchema.parse({ id: "1:1", format: "GIF" })).toThrow();
    expect(() => ExportAssetParamsSchema.parse({ id: "1:1", scale: 5 })).toThrow();
  });
  it("export-file: budgets optional", () => {
    expect(ExportFileParamsSchema.parse({}).outputDir).toBeUndefined();
    expect(() => ExportFileParamsSchema.parse({ maxNodes: 0 })).toThrow();
  });
});

describe("delete/update schemas", () => {
  it("delete-node + delete-component-property", () => {
    expect(() => DeleteNodeParamsSchema.parse({ id: "10:20" })).not.toThrow();
    expect(() => DeleteNodeParamsSchema.parse({ id: "x" })).toThrow();
    expect(() => DeleteComponentPropertyParamsSchema.parse({ componentId: "1:1", name: "n" })).not.toThrow();
  });
  it("move/resize/corner/layout", () => {
    expect(() => MoveNodeParamsSchema.parse({ id: "1:1", x: 1, y: 2 })).not.toThrow();
    expect(() => MoveNodeParamsSchema.parse({ id: "1:1", x: 1 })).toThrow();
    expect(() => ResizeNodeParamsSchema.parse({ id: "1:1", width: 1, height: 1 })).not.toThrow();
    expect(SetCornerRadiusParamsSchema.parse({ id: "1:1", cornerRadius: 8 }).cornerRadius).toBe(8);
    expect(() => SetLayoutParamsSchema.parse({ id: "1:1", mode: "HORIZONTAL" })).not.toThrow();
    expect(() => SetLayoutParamsSchema.parse({ id: "1:1", mode: "GRID" })).toThrow();
  });
  it("colors require 8-digit hex", () => {
    expect(() => SetFillColorParamsSchema.parse({ id: "1:1", color: "#FF0000FF" })).not.toThrow();
    expect(() => SetFillColorParamsSchema.parse({ id: "1:1", color: "#FFF" })).toThrow();
    expect(() => SetStrokeColorParamsSchema.parse({ id: "1:1", color: "red" })).toThrow();
  });
  it("parent/instance/refs/edit", () => {
    expect(() => SetParentIdParamsSchema.parse({ id: "1:1", parentId: "2:2" })).not.toThrow();
    expect(() => SetParentIdParamsSchema.parse({ id: "bad", parentId: "2:2" })).toThrow();
    expect(SetParentIdParamsSchema.parse({ id: "1:1", parentId: "2:2", index: 0, absolute: false })).toMatchObject({ index: 0, absolute: false });
    expect(() => SetParentIdParamsSchema.parse({ id: "1:1", parentId: "2:2", index: -1 })).toThrow();
    expect(() => SetParentIdParamsSchema.parse({ id: "1:1", parentId: "2:2", index: 1.5 })).toThrow();
  });
  it("stroke weight/align + effects union (shadow defaults, blur needs radius)", () => {
    expect(SetStrokeColorParamsSchema.parse({ id: "1:1", color: "#000000FF", weight: 1, align: "INSIDE" })).toMatchObject({ weight: 1, align: "INSIDE" });
    expect(() => SetStrokeColorParamsSchema.parse({ id: "1:1", color: "#000000FF", align: "MIDDLE" })).toThrow();
    const fx = SetEffectsParamsSchema.parse({ id: "1:1", effects: [{ type: "DROP_SHADOW", color: "#00000040" }, { type: "LAYER_BLUR", radius: 8 }] });
    expect(fx.effects[0]).toEqual({ type: "DROP_SHADOW", color: "#00000040", offset: { x: 0, y: 4 }, radius: 4, spread: 0 });
    expect(fx.effects[1]).toEqual({ type: "LAYER_BLUR", radius: 8 });
    expect(SetEffectsParamsSchema.parse({ id: "1:1", effects: [] }).effects).toEqual([]);
    expect(() => SetEffectsParamsSchema.parse({ id: "1:1", effects: [{ type: "DROP_SHADOW" }] })).toThrow();
    expect(() => SetEffectsParamsSchema.parse({ id: "1:1", effects: [{ type: "LAYER_BLUR" }] })).toThrow();
    expect(() => SetEffectsParamsSchema.parse({ id: "1:1", effects: [{ type: "NOISE", radius: 1 }] })).toThrow();
  });
  it("gradient (LINEAR/0deg defaults, 2..16 stops, positions 0..1) + image-fill (FILL default, keeps imageData)", () => {
    const stops = [{ position: 0, color: "#000000FF" }, { position: 1, color: "#FFFFFF00" }];
    expect(SetFillGradientParamsSchema.parse({ id: "1:1", stops })).toMatchObject({ type: "LINEAR", angle: 0 });
    expect(() => SetFillGradientParamsSchema.parse({ id: "1:1", stops: stops.slice(0, 1) })).toThrow();
    expect(() => SetFillGradientParamsSchema.parse({ id: "1:1", stops: [{ position: 1.5, color: "#000000FF" }, stops[1]] })).toThrow();
    expect(() => SetFillGradientParamsSchema.parse({ id: "1:1", stops, type: "ANGULAR" })).toThrow();
    const img = SetImageFillParamsSchema.parse({ id: "1:1", url: "https://x/y.png", imageData: [1, 2] });
    expect(img).toMatchObject({ scaleMode: "FILL", imageData: [1, 2] });
    expect(() => SetInstancePropertiesParamsSchema.parse({ instanceId: "1:1", properties: { a: 1 } })).not.toThrow();
    expect(() => SetNodeComponentPropertyReferencesParamsSchema.parse({ id: "1:1", componentPropertyReferences: { characters: "prop" } })).not.toThrow();
    expect(() => SetNodeComponentPropertyReferencesParamsSchema.parse({ id: "1:1", componentPropertyReferences: { bogus: "x" } })).toThrow();
    expect(() => EditComponentPropertyParamsSchema.parse({ componentId: "1:1", name: "n", type: "TEXT", defaultValue: "d" })).not.toThrow();
  });
  it("shared ColorHex", () => {
    expect(ColorHexSchema.safeParse("#000000FF").success).toBe(true);
    expect(ColorHexSchema.safeParse("#000").success).toBe(false);
  });
});
