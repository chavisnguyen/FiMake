import { ResizeNodeParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { withNode } from "../node-helper";

export async function resizeNode(args: ResizeNodeParams): Promise<ToolResult> {
    return withNode(args.id, (node) => {
        (node as unknown as SceneNode & { resize: (width: number, height: number) => void }).resize(args.width, args.height);
    });
}
