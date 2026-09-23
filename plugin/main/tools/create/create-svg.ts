import { CreateSvgParams } from "@shared/types";
import { formatError } from "@shared/format-error";
import { ToolResult } from "../tool-result";
import { serializeFrame } from "../../serialization/serialize-frame";
import { appendToParent } from "../node-helper";

export async function createSvg(args: CreateSvgParams): Promise<ToolResult> {
    if (!args.svg) {
        return { isError: true, content: "Missing svg: MCP must resolve svg/url/filePath in Node and forward markup (shared schema must keep svg)" };
    }
    let node: FrameNode;
    try {
        // Also appends to currentPage; appendToParent re-parents when parentId is set.
        node = figma.createNodeFromSvg(args.svg);
    } catch (error) {
        return { isError: true, content: `Invalid SVG: ${formatError(error)}` };
    }
    node.name = args.name;
    node.x = args.x;
    node.y = args.y;

    const err = await appendToParent(node, args.parentId);
    if (err) {
        node.remove();
        return err;
    }
    return { isError: false, content: serializeFrame(node) };
}
