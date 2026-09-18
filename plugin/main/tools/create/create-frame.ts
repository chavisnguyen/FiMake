import { CreateFrameParams } from "@shared/types";
import { ToolResult } from "../tool-result";
import { serializeFrame } from "../../serialization/serialize-frame";
import { appendToParent } from "../node-helper";

export async function createFrame(args: CreateFrameParams): Promise<ToolResult> {
    const frame = figma.createFrame();
    frame.x = args.x;
    frame.y = args.y;
    frame.resize(args.width, args.height);
    frame.name = args.name;

    const err = await appendToParent(frame, args.parentId);
    if (err) return err;

    return {
        isError: false,
        content: serializeFrame(frame)
    }
}
