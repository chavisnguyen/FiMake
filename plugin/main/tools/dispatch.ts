import { z } from "zod";
import {
  AddComponentPropertyParamsSchema,
  AddPrototypeLinkParamsSchema,
  CloneNodeParamsSchema,
  CreateComponentParamsSchema,
  CreateFrameParamsSchema,
  CreateImageParamsSchema,
  CreateInstanceParamsSchema,
  CreateRectangleParamsSchema,
  CreateSvgParamsSchema,
  CreateTextParamsSchema,
  DeleteComponentPropertyParamsSchema,
  DeleteNodeParamsSchema,
  EditComponentPropertyParamsSchema,
  ExportAssetParamsSchema,
  GetAllComponentsParamsSchema,
  GetNodeInfoParamsSchema,
  GetPagesParamsSchema,
  MoveNodeParamsSchema,
  ResizeNodeParamsSchema,
  SetCornerRadiusParamsSchema,
  SetEffectsParamsSchema,
  SetFillColorParamsSchema,
  SetInstancePropertiesParamsSchema,
  SetLayoutParamsSchema,
  SetNodeComponentPropertyReferencesParamsSchema,
  SetParentIdParamsSchema,
  SetStrokeColorParamsSchema,
} from "@shared/types";
import { wrapToolHandler } from "./wrap-tool-handler";
import type { ToolResult } from "./tool-result";
import { createRectangle } from "./create/create-rectangle";
import { createFrame } from "./create/create-frame";
import { createText } from "./create/create-text";
import { createComponent } from "./create/create-component";
import { createInstance } from "./create/create-instance";
import { createImage } from "./create/create-image";
import { createSvg } from "./create/create-svg";
import { cloneNode } from "./create/clone-node";
import { addComponentProperty } from "./create/add-component-property";
import { addPrototypeLink } from "./create/add-prototype-link";
import { getSelection } from "./read/get-selection";
import { getNodeInfo } from "./read/get-node-info";
import { getPages } from "./read/get-pages";
import { getAllComponents } from "./read/get-all-components";
import { exportAsset } from "./read/export-asset";
import { moveNode } from "./update/move-node";
import { resizeNode } from "./update/resize-node";
import { setFillColor } from "./update/set-fill-color";
import { setStrokeColor } from "./update/set-stroke-color";
import { setEffects } from "./update/set-effects";
import { setCornerRadius } from "./update/set-corner-radius";
import { setLayout } from "./update/set-layout";
import { setParentId } from "./update/set-parent-id";
import { setInstanceProperties } from "./update/set-instance-properties";
import { editComponentProperty } from "./update/edit-component-property";
import { setNodeComponentPropertyReferences } from "./update/set-node-component-property-references";
import { deleteNode } from "./delete/delete-node";
import { deleteComponentProperty } from "./delete/delete-component-property";

type DispatchFn = (args: unknown) => Promise<ToolResult>;

/** zod schema per command (single source: mcp/src/shared). Missing = no params. */
const PARAM_SCHEMAS: Record<string, z.ZodTypeAny> = {
  "create-rectangle": CreateRectangleParamsSchema,
  "create-frame": CreateFrameParamsSchema,
  "create-text": CreateTextParamsSchema,
  "create-instance": CreateInstanceParamsSchema,
  "create-component": CreateComponentParamsSchema,
  "create-image": CreateImageParamsSchema,
  "create-svg": CreateSvgParamsSchema,
  "clone-node": CloneNodeParamsSchema,
  "add-component-property": AddComponentPropertyParamsSchema,
  "add-prototype-link": AddPrototypeLinkParamsSchema,
  "get-node-info": GetNodeInfoParamsSchema,
  "get-pages": GetPagesParamsSchema,
  "get-all-components": GetAllComponentsParamsSchema,
  "export-asset": ExportAssetParamsSchema,
  "move-node": MoveNodeParamsSchema,
  "resize-node": ResizeNodeParamsSchema,
  "set-fill-color": SetFillColorParamsSchema,
  "set-stroke-color": SetStrokeColorParamsSchema,
  "set-effects": SetEffectsParamsSchema,
  "set-corner-radius": SetCornerRadiusParamsSchema,
  "set-layout": SetLayoutParamsSchema,
  "set-parent-id": SetParentIdParamsSchema,
  "set-instance-properties": SetInstancePropertiesParamsSchema,
  "edit-component-property": EditComponentPropertyParamsSchema,
  "set-node-component-property-references": SetNodeComponentPropertyReferencesParamsSchema,
  "delete-node": DeleteNodeParamsSchema,
  "delete-component-property": DeleteComponentPropertyParamsSchema,
};

/**
 * Adapt a typed tool to the untyped socket boundary: params arrive as JSON,
 * so each entry validates with its zod schema first — malformed args become
 * a clear TASK_FAILED instead of a crash or a silent hang.
 */
function wrap<T>(command: string, fn: (args: T) => Promise<ToolResult>): DispatchFn {
  const run = wrapToolHandler(fn);
  const schema = PARAM_SCHEMAS[command];
  return (args: unknown) => {
    if (args === undefined) return run({} as T);
    if (typeof args !== "object" || args === null) {
      return Promise.resolve({ isError: true, content: "Invalid args: expected object" });
    }
    if (!schema) return run(args as T);
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return Promise.resolve({ isError: true, content: `Invalid args for ${command}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` });
    }
    return run(parsed.data as T);
  };
}

export const TOOL_HANDLERS: Record<string, DispatchFn> = {
  "create-rectangle": wrap("create-rectangle", createRectangle),
  "create-frame": wrap("create-frame", createFrame),
  "create-text": wrap("create-text", createText),
  "create-component": wrap("create-component", createComponent),
  "create-instance": wrap("create-instance", createInstance),
  "create-image": wrap("create-image", createImage),
  "create-svg": wrap("create-svg", createSvg),
  "clone-node": wrap("clone-node", cloneNode),
  "add-component-property": wrap("add-component-property", addComponentProperty),
  "add-prototype-link": wrap("add-prototype-link", addPrototypeLink),
  "get-selection": wrap("get-selection", getSelection),
  "get-node-info": wrap("get-node-info", getNodeInfo),
  "get-pages": wrap("get-pages", getPages),
  "get-all-components": wrap("get-all-components", getAllComponents),
  "export-asset": wrap("export-asset", exportAsset),
  "move-node": wrap("move-node", moveNode),
  "resize-node": wrap("resize-node", resizeNode),
  "set-fill-color": wrap("set-fill-color", setFillColor),
  "set-stroke-color": wrap("set-stroke-color", setStrokeColor),
  "set-effects": wrap("set-effects", setEffects),
  "set-corner-radius": wrap("set-corner-radius", setCornerRadius),
  "set-layout": wrap("set-layout", setLayout),
  "set-parent-id": wrap("set-parent-id", setParentId),
  "set-instance-properties": wrap("set-instance-properties", setInstanceProperties),
  "edit-component-property": wrap("edit-component-property", editComponentProperty),
  "set-node-component-property-references": wrap("set-node-component-property-references", setNodeComponentPropertyReferences),
  "delete-node": wrap("delete-node", deleteNode),
  "delete-component-property": wrap("delete-component-property", deleteComponentProperty),
};

/** Run one plugin task by command; unknown commands become a ToolResult error. */
export async function dispatchTask(command: string, args: unknown): Promise<ToolResult> {
  if (typeof command !== "string" || command.length === 0) {
    return { isError: true, content: "Invalid command" };
  }
  const handler = TOOL_HANDLERS[command];
  if (!handler) {
    return { isError: true, content: "Tool not found" };
  }
  return handler(args);
}
