import { ToolResult } from "tools/tool-result";
import { SetParentIdParams } from "@shared/types";
import { serializeNode } from "serialization/serialization";

export async function setParentId(args: SetParentIdParams): Promise<ToolResult> {
    await figma.loadAllPagesAsync();
    const node = await figma.getNodeByIdAsync(args.id);
    if (!node) {
        return { isError: true, content: "Node not found" };
    }
    const parent = await figma.getNodeByIdAsync(args.parentId);
    if (!parent) {
        return { isError: true, content: "Parent node not found" };
    }
    (parent as { appendChild: (node: SceneNode) => void }).appendChild(node as SceneNode);
    return { isError: false, content: serializeNode(node as FrameNode) };
}