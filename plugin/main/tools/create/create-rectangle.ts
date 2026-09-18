import { CreateRectangleParams } from "@shared/types";
import { ToolResult } from "../tool-result";
import { serializeRectangle } from "../../serialization/serialize-rectangle";
import { appendToParent } from "../node-helper";

export async function createRectangle(args: CreateRectangleParams): Promise<ToolResult> {
    const rectangle = figma.createRectangle();
    rectangle.x = args.x;
    rectangle.y = args.y;
    rectangle.resize(args.width, args.height);
    rectangle.name = args.name;

    const err = await appendToParent(rectangle, args.parentId);
    if (err) return err;

    return {
        isError: false,
        content: serializeRectangle(rectangle)
    }
}
