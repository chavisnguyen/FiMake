import { SetStrokeColorParams } from "@shared/types";
import { getSolidHEXColorPaint } from "utils/get-solid-color-paint";
import { ToolResult } from "tools/tool-result";
import { serializeNode } from "serialization/serialization";
import { loadNode } from "../node-helper";
import { formatError } from "@shared/format-error";

export async function setStrokeColor(args: SetStrokeColorParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    const node = loaded;
    try {
        if ("strokes" in node) {
            const n = node as unknown as { strokes: Paint[]; strokeWeight: number; strokeAlign: string };
            n.strokes = [getSolidHEXColorPaint(args.color)];
            if (args.weight !== undefined) n.strokeWeight = args.weight;
            if (args.align !== undefined) n.strokeAlign = args.align;
        }
        else {
            return { isError: true, content: "Node does not have a strokes property" };
        }
    }
    catch (error) {
        return { isError: true, content: `Error setting stroke color: ${formatError(error)}` };
    }
    return { isError: false, content: serializeNode(node as unknown as SceneNode) };
}
