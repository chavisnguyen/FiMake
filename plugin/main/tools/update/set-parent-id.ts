import { ToolResult } from "tools/tool-result";
import { SetParentIdParams } from "@shared/types";
import { serializeNode } from "serialization/serialization";

export async function setParentId(args: SetParentIdParams): Promise<ToolResult> {
    await figma.loadAllPagesAsync();
    const node = await figma.getNodeByIdAsync(args.id);
    if (!node) {
        return { isError: true, content: "Node not found" };
    }
    const parent = await figma.getNodeByIdAsync(args.parentId);
    if (!parent || !("appendChild" in parent)) {
        return { isError: true, content: "Parent node not found" };
    }
    const container = parent as BaseNode & ChildrenMixin;
    const child = node as SceneNode;

    // Validate everything before moving so a rejected call changes nothing.
    if (args.absolute !== undefined && (!("layoutMode" in parent) || parent.layoutMode === "NONE")) {
        return { isError: true, content: "absolute requires an auto-layout parent (set-layout HORIZONTAL/VERTICAL first)" };
    }
    if (args.index !== undefined) {
        const current = child.parent?.id === container.id ? container.children.findIndex((c) => c.id === child.id) : -1;
        const max = current >= 0 ? container.children.length - 1 : container.children.length;
        if (args.index > max) {
            return { isError: true, content: `index out of range (0..${max})` };
        }
        // Figma's insertChild index counts the node's own old slot, so moving it
        // later in the same parent needs +1 for `index` to be its final position.
        container.insertChild(current >= 0 && args.index > current ? args.index + 1 : args.index, child);
    } else {
        container.appendChild(child);
    }
    if (args.absolute !== undefined) {
        (child as FrameNode).layoutPositioning = args.absolute ? "ABSOLUTE" : "AUTO";
    }
    return { isError: false, content: serializeNode(child) };
}
