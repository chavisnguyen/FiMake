import type { ListFontsParams } from "@shared/types";
import { ToolResult } from "../tool-result";

const MAX_FAMILIES_WITH_STYLES = 30;

/** Font list changes only when the user installs/removes fonts: cache 60s. */
let fontCache: { at: number; fonts: Font[] } | null = null;
const FONT_CACHE_TTL_MS = 60_000;

/** Test hook: drop the cached font list. */
export function resetFontCache(): void {
    fontCache = null;
}

async function cachedFonts(): Promise<Font[]> {
    const now = Date.now();
    if (fontCache !== null && now - fontCache.at < FONT_CACHE_TTL_MS) return fontCache.fonts;
    const fonts = await figma.listAvailableFontsAsync();
    fontCache = { at: now, fonts };
    return fonts;
}

export async function listFonts(args: ListFontsParams): Promise<ToolResult> {
    const fonts = await cachedFonts();
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
