import type { ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../bridge/task-manager";
import type { SocketManager } from "../transport/socket-manager";
import { safeToolProcessor } from "./safe-tool-processor";
import { withTarget } from "./target";
import {
  AddComponentPropertyParamsSchema,
  AddPrototypeLinkParamsSchema,
  CloneNodeParamsSchema,
  CreateComponentParamsSchema,
  CreateFrameParamsSchema,
  CreateInstanceParamsSchema,
  CreateRectangleParamsSchema,
  CreateTextParamsSchema,
  DeleteComponentPropertyParamsSchema,
  DeleteNodeParamsSchema,
  EditComponentPropertyParamsSchema,
  GetAllComponentsParamsSchema,
  GetNodeInfoParamsSchema,
  GetPagesParamsSchema,
  MoveNodeParamsSchema,
  ResizeNodeParamsSchema,
  SetCornerRadiusParamsSchema,
  SetFillColorParamsSchema,
  SetInstancePropertiesParamsSchema,
  SetLayoutParamsSchema,
  SetNodeComponentPropertyReferencesParamsSchema,
  SetParentIdParamsSchema,
  SetStrokeColorParamsSchema,
} from "../shared/types/index";
import { getSelection } from "./read/get-selection";
import { createImage } from "./create/create-image";
import { createSvg } from "./create/create-svg";
import { exportAsset } from "./read/export-asset";
import { exportFile } from "./read/export-file";
import { listClients } from "./read/list-clients";

/**
 * Tools that run purely Node-side (fetch, disk writes, fan-out over other
 * tools, connection state) and therefore intentionally have NO handler in
 * plugin/main/tools/dispatch.ts:
 * - get-selection: wraps whole TaskResult (no schema)
 * - create-image: fetches URL in Node, forwards bytes to plugin
 * - create-svg: resolves inline/url/filePath SVG in Node, forwards markup to plugin
 * - export-asset: optionally writes the asset to disk
 * - export-file: fans out over get-pages/get-node-info, writes JSON to disk
 * - list-clients: reads the bridge's connected plugin windows
 * Every other tool forwards its params to the plugin (`name` doubles as the
 * task command) and must have a matching TOOL_HANDLERS entry.
 */
export const NODE_ONLY_TOOLS = ["export-file", "list-clients"] as const;
export const NODE_WRAPPED_TOOLS = ["get-selection", "create-image", "create-svg", "export-asset", "export-file", "list-clients"] as const;
export interface SimpleToolDef {
  name: string;
  description: string;
  shape: ZodRawShape;
}

export const SIMPLE_TOOL_DEFS: SimpleToolDef[] = [
  { name: "create-rectangle", description: "Create a rectangle.", shape: CreateRectangleParamsSchema.shape },
  { name: "create-frame", description: "Create a frame.", shape: CreateFrameParamsSchema.shape },
  { name: "create-text", description: "Create a text.", shape: CreateTextParamsSchema.shape },
  { name: "create-instance", description: "Create a instance.", shape: CreateInstanceParamsSchema.shape },
  { name: "create-component", description: "Create a component.", shape: CreateComponentParamsSchema.shape },
  { name: "clone-node", description: "Clone a node.", shape: CloneNodeParamsSchema.shape },
  { name: "add-component-property", description: "Add a component property.", shape: AddComponentPropertyParamsSchema.shape },
  { name: "add-prototype-link", description: "Add a prototype interaction (click to navigate) between two nodes.", shape: AddPrototypeLinkParamsSchema.shape },
  { name: "get-node-info", description: "Get layout, colors and content of a node (lean output). `depth`: 0 = this node only, N = N levels, -1 = FULL subtree to every leaf. Any node not fully expanded is marked `childrenTruncated: true` (re-request its id to cover it) so no element is ever dropped silently. `maxNodes` caps nodes per response (default 10000) and `maxChars` caps serialized size (default 35000, keeps the response inline); overflow becomes stubs marked `_truncated`, the parent gets `childrenTruncated: true`, and the root reports `_truncatedCount`. When `_truncatedCount` appears, re-request the flagged node ids to cover the rest. `fields` limits groups (geometry, layout, fills, strokes, effects, text, component, children).", shape: GetNodeInfoParamsSchema.shape },
  { name: "get-pages", description: "Get all pages in the current file.", shape: GetPagesParamsSchema.shape },
  { name: "get-all-components", description: "Get all components in the current file.", shape: GetAllComponentsParamsSchema.shape },
  { name: "move-node", description: "Move a node.", shape: MoveNodeParamsSchema.shape },
  { name: "resize-node", description: "Resize a node.", shape: ResizeNodeParamsSchema.shape },
  { name: "set-fill-color", description: "Set the fill color of a node.", shape: SetFillColorParamsSchema.shape },
  { name: "set-stroke-color", description: "Set the stroke color of a node.", shape: SetStrokeColorParamsSchema.shape },
  { name: "set-corner-radius", description: "Set the corner radius of a node.", shape: SetCornerRadiusParamsSchema.shape },
  { name: "set-layout", description: "Set the layout of a node. Turning auto-layout on (NONE -> HORIZONTAL/VERTICAL) keeps the frame FIXED at its current size on any axis whose layoutSizing* you omit; pass HUG/FILL explicitly to change that.", shape: SetLayoutParamsSchema.shape },
  { name: "set-parent-id", description: "Set the parent id of a node.", shape: SetParentIdParamsSchema.shape },
  { name: "set-instance-properties", description: "Set the properties of an instance.", shape: SetInstancePropertiesParamsSchema.shape },
  { name: "edit-component-property", description: "Edit a component property.", shape: EditComponentPropertyParamsSchema.shape },
  { name: "set-node-component-property-references", description: "Set the component property references of a node.", shape: SetNodeComponentPropertyReferencesParamsSchema.shape },
  { name: "delete-node", description: "Delete a node.", shape: DeleteNodeParamsSchema.shape },
  { name: "delete-component-property", description: "Delete a component property.", shape: DeleteComponentPropertyParamsSchema.shape },
];

export function registerSimpleTool(server: McpServer, taskManager: TaskManager, def: SimpleToolDef): void {
  // Every tool accepts routing fields; the orchestrator strips them into
  // the envelope so the plugin never sees them (parity with dispatch.ts
  // holds because TOOL_HANDLERS only cares about `name`).
  const shape = withTarget(def.shape);
  server.tool(def.name, def.description, shape, async (params: Record<string, unknown>) => {
    return safeToolProcessor(taskManager.runTask(def.name, params));
  });
}

/** Register every tool: simple forwarding plus the custom ones. */
export function registerAllTools(server: McpServer, taskManager: TaskManager, socketManager?: SocketManager): void {
  for (const def of SIMPLE_TOOL_DEFS) {
    registerSimpleTool(server, taskManager, def);
  }
  getSelection(server, taskManager);
  createImage(server, taskManager);
  createSvg(server, taskManager);
  exportAsset(server, taskManager);
  exportFile(server, taskManager);
  if (socketManager !== undefined) {
    listClients(server, socketManager);
  }
}
