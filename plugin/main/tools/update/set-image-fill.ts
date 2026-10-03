import { SetImageFillParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { decodeBase64 } from "utils/base64";
import { withNode } from "../node-helper";

export async function setImageFill(args: SetImageFillParams): Promise<ToolResult> {
    const b64 = args.imageData;
    if (!b64 || b64.length === 0) {
        return { isError: true, content: "Missing imageData: MCP must fetch the URL in Node and forward base64 bytes (shared schema must keep imageData)" };
    }
    let bytes: Uint8Array;
    try {
        bytes = decodeBase64(b64);
    } catch {
        return { isError: true, content: "Invalid imageData: not valid base64" };
    }
    return withNode(args.id, (node) => {
        if (!("fills" in node)) throw new Error("Node does not have a fills property");
        const image = figma.createImage(bytes);
        (node as unknown as { fills: Paint[] }).fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: args.scaleMode }];
    });
}
