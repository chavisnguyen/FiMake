import { serializePage } from "serialization/serialize-page";
import { ToolResult } from "../tool-result";
import type { GetPagesParams } from "@shared/types";

export async function getPages(_args: GetPagesParams): Promise<ToolResult> {
    // main.ts already ran loadAllPagesAsync for this command.
    // figma.root.children ARE the pages — no need for a full-file findAll.
    const serializedPages = figma.root.children.map((page) => serializePage(page as PageNode));
    return {
        isError: false,
        content: serializedPages,
    };
}