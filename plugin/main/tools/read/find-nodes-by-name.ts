import { FindNodesByNameInput } from "@shared/types";
import { ToolResult } from "../tool-result";

export interface FoundNode {
    id: string;
    name: string;
    type: string;
    pageId: string;
    pageName: string;
}

export async function findNodesByName(args: FindNodesByNameInput): Promise<ToolResult> {
    // main.ts preloads all pages for this command; findAll with a predicate
    // visits every loaded node. Cap matches so huge files stay bounded.
    // (Input type: defaults apply via dispatch validation; ?? keeps direct
    // calls safe under zod v4, where .default() output stays required.)
    const exact = args.exact ?? false;
    const needle = exact ? args.name : args.name.toLowerCase();
    const limit = args.limit ?? 50;
    const found: FoundNode[] = [];
    const pages = figma.root.children;
    const matchesName = (name: string): boolean =>
        exact ? name === needle : name.toLowerCase().includes(needle);
    for (const page of pages) {
        if (found.length >= limit) break;
        // findAll visits descendants only — check the page itself too
        // (without skipping its subtree: children may also match).
        if (matchesName(page.name)) {
            found.push({ id: page.id, name: page.name, type: page.type, pageId: page.id, pageName: page.name });
        }
        if (found.length >= limit) break;
        const matches = page.findAll((node) => matchesName(node.name));
        for (const node of matches) {
            if (found.length >= limit) break;
            found.push({
                id: node.id,
                name: node.name,
                type: node.type,
                pageId: page.id,
                pageName: page.name,
            });
        }
    }
    if (found.length === 0) {
        return { isError: true, content: `No nodes named "${args.name}"${exact ? " (exact)" : ""} — try a shorter substring with exact:false` };
    }
    return { isError: false, content: found };
}
