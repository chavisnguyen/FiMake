import { ToolResult } from "tools/tool-result";
import { CreateTextParams } from "@shared/types";
import { getSolidHEXColorPaint } from "utils/get-solid-color-paint";
import { serializeText } from "serialization/serialize-text";
import { formatError } from "@shared/format-error";
import { applyTextStyle, fontLoadError, resolveFontStyle } from "../text-style";

export async function createText(args: CreateTextParams): Promise<ToolResult> {
    const text = figma.createText();
    // createText already placed the node on the page: remove it on any failure
    // so a rejected call never leaves an empty orphan behind.
    const fail = (content: string): ToolResult => {
        text.remove();
        return { isError: true, content };
    };
    text.x = args.x;
    text.y = args.y;

    try {
        text.fills = [getSolidHEXColorPaint(args.fontColor)];
    } catch (error) {
        return fail(`Error setting font color: ${formatError(error)}`);
    }

    const style = resolveFontStyle(args.fontStyle, args.fontWeight, "Regular");
    try {
        await figma.loadFontAsync({ family: args.fontName, style });
        text.fontName = { family: args.fontName, style };
    } catch (error) {
        return fail(fontLoadError(args.fontName, style, formatError(error)));
    }

    text.fontSize = args.fontSize;

    text.name = args.name;
    text.characters = args.text;

    try {
        applyTextStyle(text, args);
    } catch (error) {
        return fail(`Error setting text style: ${formatError(error)}`);
    }

    if (args.parentId) {
        const parent = await figma.getNodeByIdAsync(args.parentId);
        if (parent) {
            (parent as FrameNode).appendChild(text);
        }
        else {
            return fail("Parent node not found");
        }
    }

    return { isError: false, content: serializeText(text) };
}
