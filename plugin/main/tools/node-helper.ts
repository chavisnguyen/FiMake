import { ToolResult } from "./tool-result";
import { serializeNode } from "serialization/serialization";
import { formatError } from "@shared/format-error";

/** Load a node or return a "Node not found" error result. */
export async function loadNode(id: string): Promise<BaseNode | ToolResult> {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) {
        return { isError: true, content: "Node not found" };
    }
    return node as BaseNode;
}

function isErr(value: unknown): value is ToolResult {
    return typeof value === "object" && value !== null && "isError" in value;
}

/**
 * Load node `id`, run `fn` on it, return serialized node.
 * Cuts the getNodeByIdAsync + null-check + serialize boilerplate
 * repeated in every single-node tool.
 */
export async function withNode(id: string, fn: (node: BaseNode) => void | Promise<void>): Promise<ToolResult> {
    const node = await loadNode(id);
    if (isErr(node)) return node;
    try {
        await fn(node);
    } catch (error) {
        return { isError: true, content: formatError(error) };
    }
    return { isError: false, content: serializeNode(node as unknown as SceneNode) };
}

/**
 * Append a created node to `parentId`, or to the current page when absent.
 * Returns a "Parent node not found" error result (caller returns it).
 * Cuts the parent-lookup boilerplate repeated in every create tool.
 */
export async function appendToParent(node: SceneNode, parentId: string | undefined): Promise<ToolResult | null> {
    if (!parentId) {
        figma.currentPage.appendChild(node);
        return null;
    }
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent || !("appendChild" in parent)) {
        return { isError: true, content: "Parent node not found" };
    }
    (parent as FrameNode).appendChild(node);
    return null;
}
