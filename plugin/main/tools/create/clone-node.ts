import { CloneNodeParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { serializeNode } from "serialization/serialization";
import { loadNode } from "../node-helper";

export async function cloneNode(args: CloneNodeParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    const sceneNode = loaded as unknown as SceneNode;
    if (!("clone" in sceneNode)) {
        return { isError: true, content: "Node does not support cloning" };
    }
    const clonedNode = sceneNode.clone();
    clonedNode.name = sceneNode.name;
    return { isError: false, content: serializeNode(clonedNode) };
}
