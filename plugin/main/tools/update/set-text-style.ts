import { SetTextStyleParams } from "@shared/types";
import { formatError } from "@shared/format-error";
import { ToolResult } from "tools/tool-result";
import { getSolidHEXColorPaint } from "utils/get-solid-color-paint";
import { serializeText } from "serialization/serialize-text";
import { loadNode } from "../node-helper";
import { applyTextStyle, fontLoadError, resolveFontStyle } from "../text-style";

export async function setTextStyle(args: SetTextStyleParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    if (loaded.type !== "TEXT") return { isError: true, content: "Node is not a text node" };
    const text = loaded as TextNode;

    // Figma rejects any text edit until every font used in the node is loaded.
    const len = text.characters.length;
    const current = len > 0 ? text.getRangeAllFontNames(0, len) : text.fontName === figma.mixed ? [] : [text.fontName];
    try {
        await Promise.all(current.map((f) => figma.loadFontAsync(f)));
    } catch (error) {
        return { isError: true, content: `Error loading the node's current fonts: ${formatError(error)}` };
    }

    if (args.fontName !== undefined || args.fontWeight !== undefined || args.fontStyle !== undefined) {
        const base = text.fontName === figma.mixed ? current[0] : text.fontName;
        const family = args.fontName ?? base?.family ?? "Inter";
        const style = resolveFontStyle(args.fontStyle, args.fontWeight, base?.style ?? "Regular");
        try {
            await figma.loadFontAsync({ family, style });
        } catch (error) {
            return { isError: true, content: fontLoadError(family, style, formatError(error)) };
        }
        text.fontName = { family, style };
    }

    try {
        if (args.fontSize !== undefined) text.fontSize = args.fontSize;
        if (args.fontColor !== undefined) text.fills = [getSolidHEXColorPaint(args.fontColor)];
        applyTextStyle(text, args);
    } catch (error) {
        return { isError: true, content: `Error setting text style: ${formatError(error)}` };
    }
    return { isError: false, content: serializeText(text) };
}
