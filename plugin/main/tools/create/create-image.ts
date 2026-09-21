import { CreateImageParams } from "@shared/types";
import { ToolResult } from "../tool-result";
import { serializeRectangle } from "serialization/serialize-rectangle";

export interface CreateImagePluginParams extends CreateImageParams {
    imageData: number[];
}

export async function createImage(args: CreateImagePluginParams): Promise<ToolResult> {
    const imageData = new Uint8Array(args.imageData);
    const image = figma.createImage(imageData);
    const node = figma.createRectangle();
    node.x = args.x;
    node.y = args.y;
    node.resize(args.width, args.height);
    node.name = args.name;
    node.fills = [
        {
            type: 'IMAGE',
            imageHash: image.hash,
            scaleMode: 'FILL'
        }
    ];

    if (args.parentId) {
        const parent = await figma.getNodeByIdAsync(args.parentId);
        if (parent && "appendChild" in parent && typeof (parent as unknown as { appendChild: unknown }).appendChild === "function") {
            (parent as unknown as { appendChild: (c: SceneNode) => void }).appendChild(node);
        } else if (parent) {
            node.remove();
            return { isError: true, content: `Parent ${args.parentId} does not support children (type: ${parent.type})` };
        }
    }

    return {
        isError: false,
        content: serializeRectangle(node)
    }
}