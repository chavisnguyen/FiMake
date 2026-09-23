import type { ListFontsParams } from "@shared/types";
import { ToolResult } from "../tool-result";

const MAX_FAMILIES_WITH_STYLES = 30;

export async function listFonts(args: ListFontsParams): Promise<ToolResult> {
    const fonts = await figma.listAvailableFontsAsync();
    const query = args.family?.trim().toLowerCase();
    const byFamily = new Map<string, string[]>();
    for (const { fontName } of fonts) {
        if (query && !fontName.family.toLowerCase().includes(query)) continue;
        const styles = byFamily.get(fontName.family) ?? [];
        styles.push(fontName.style);
        byFamily.set(fontName.family, styles);
    }
    const families = [...byFamily.keys()].sort();
    // Style lists are large (a machine can have 2000+ families): only expand them for
    // a narrow match, otherwise return names so the caller can refine `family`.
    if (!query || families.length > MAX_FAMILIES_WITH_STYLES) {
        const hint = query ? `More than ${MAX_FAMILIES_WITH_STYLES} families match; use a more specific family to get style names.` : undefined;
        return { isError: false, content: { count: families.length, families, ...(hint ? { hint } : {}) } };
    }
    return { isError: false, content: families.map((family) => ({ family, styles: byFamily.get(family) })) };
}
