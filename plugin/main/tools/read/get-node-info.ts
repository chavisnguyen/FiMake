import type { GetNodeInfoParams } from "@shared/types";
import { serializeNode } from "../../serialization/serialization";
import { ToolResult } from "../tool-result";

export async function getNodeInfo(args: GetNodeInfoParams): Promise<ToolResult> {
    const node = await figma.getNodeByIdAsync(args.id);
    if (node) {
        const serializedNode = serializeNode(node as SceneNode, {
            depth: args.depth,
            fields: args.fields,
            maxNodes: args.maxNodes,
            maxChars: args.maxChars,
        });
        return {
            isError: false,
            content: serializedNode
        };
    }
    return {
        isError: true,
        content: "Node not found"
    };
}