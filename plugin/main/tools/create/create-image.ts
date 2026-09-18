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
        if (parent) {
            (parent as FrameNode).appendChild(node);
        }
    }

    return {
        isError: false,
        content: serializeRectangle(node)
    }
}