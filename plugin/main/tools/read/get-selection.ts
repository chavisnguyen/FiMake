import { serializeNode } from "../../serialization/serialization";
import { ToolResult } from "../tool-result";

export async function getSelection(): Promise<ToolResult> {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
        const serializedSelection = selection.map(node => serializeNode(node));
        return {
            isError: false,
            content: serializedSelection
        };
    }
    return { isError: true, content: "Selection is empty" };
}