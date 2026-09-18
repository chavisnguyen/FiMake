import { DeleteComponentPropertyParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { loadNode } from "../node-helper";

export async function deleteComponentProperty(args: DeleteComponentPropertyParams): Promise<ToolResult> {
    const loaded = await loadNode(args.componentId);
    if ("isError" in loaded) {
        return { isError: true, content: "Component not found" };
    }
    const component = loaded;
    if (!(component.type === "COMPONENT")) {
        return { isError: true, content: "Node is not a component" };
    }
    (component as ComponentNode).deleteComponentProperty(args.name);
    return { isError: false, content: "Component property deleted successfully" };
}
