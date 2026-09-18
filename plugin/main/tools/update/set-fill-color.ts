import { ToolResult } from "tools/tool-result";
import { SetFillColorParams } from "@shared/types";
import { getSolidHEXColorPaint } from "utils/get-solid-color-paint";
import { serializeNode } from "serialization/serialization";
import { loadNode } from "../node-helper";
import { formatError } from "@shared/format-error";

export async function setFillColor(args: SetFillColorParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    const node = loaded;
    try {
        if ("fills" in node) {
            (node as unknown as { fills: Paint[] }).fills = [getSolidHEXColorPaint(args.color)];
        }
        else {
            return { isError: true, content: "Node does not have a fills property" };
        }
    }
    catch (error) {
        return { isError: true, content: `Error setting fill color: ${formatError(error)}` };
    }
    return { isError: false, content: serializeNode(node as unknown as SceneNode) };
}
