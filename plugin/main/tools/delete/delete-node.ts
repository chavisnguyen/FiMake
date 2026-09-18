import { DeleteNodeParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { loadNode } from "../node-helper";

export async function deleteNode(args: DeleteNodeParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    const node = loaded;
    const name = (node as SceneNode).name;
    (node as unknown as { remove: () => void }).remove();
    return { isError: false, content: `Node "${name}" (${args.id}) deleted successfully` };
}
