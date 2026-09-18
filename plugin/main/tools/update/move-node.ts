import { MoveNodeParams } from "@shared/types";
import { ToolResult } from "../tool-result";
import { withNode } from "../node-helper";

export async function moveNode(args: MoveNodeParams): Promise<ToolResult> {
    return withNode(args.id, (node) => {
        const sceneNode = node as unknown as SceneNode;
        sceneNode.x = args.x;
        sceneNode.y = args.y;
    });
}
