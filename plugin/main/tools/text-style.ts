import { getFontStyle } from "utils/get-font-style";

export interface TextStyleInput {
    width?: number;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
    maxLines?: number;
}

/** Style name to load: exact `fontStyle` wins, else mapped from `fontWeight`. */
export function resolveFontStyle(fontStyle: string | undefined, fontWeight: number | undefined, fallback: string): string {
    if (fontStyle) return fontStyle;
    return fontWeight !== undefined ? getFontStyle(fontWeight) : fallback;
}

export function fontLoadError(family: string, style: string, error: string): string {
    return `Error loading font "${family}" with style "${style}": ${error}. Call list-fonts with family "${family}" to see its exact style names, then pass fontStyle.`;
}

/** Apply layout/typography props. Fonts of `text` must already be loaded. */
export function applyTextStyle(text: TextNode, s: TextStyleInput): void {
    if (s.width !== undefined) {
        text.resize(s.width, Math.max(text.height, 1));
        text.textAutoResize = "HEIGHT";
    }
    if (s.lineHeight !== undefined) text.lineHeight = { value: s.lineHeight, unit: "PIXELS" };
    if (s.letterSpacing !== undefined) text.letterSpacing = { value: s.letterSpacing, unit: "PERCENT" };
    if (s.textAlign !== undefined) text.textAlignHorizontal = s.textAlign;
    if (s.maxLines !== undefined) {
        text.textTruncation = "ENDING";
        text.maxLines = s.maxLines;
    }
}
