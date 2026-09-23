import { SetImageFillParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { withNode } from "../node-helper";

export async function setImageFill(args: SetImageFillParams): Promise<ToolResult> {
    const bytes = args.imageData;
    if (!bytes || bytes.length === 0) {
        return { isError: true, content: "Missing imageData: MCP must fetch the URL in Node and forward bytes (shared schema must keep imageData)" };
    }
    return withNode(args.id, (node) => {
        if (!("fills" in node)) throw new Error("Node does not have a fills property");
        const image = figma.createImage(new Uint8Array(bytes));
        (node as unknown as { fills: Paint[] }).fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: args.scaleMode }];
    });
}
