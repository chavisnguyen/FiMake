import { serializePage } from "serialization/serialize-page";
import { ToolResult } from "../tool-result";
import type { GetPagesParams } from "@shared/types";

export async function getPages(_args: GetPagesParams): Promise<ToolResult> {
    // main.ts already ran loadAllPagesAsync for this command.
    const pages = figma.root.findAllWithCriteria({
        types: ["PAGE"],
    });
    const serializedPages = pages.map((page) => serializePage(page as PageNode));
    return {
        isError: false,
        content: serializedPages,
    };
}