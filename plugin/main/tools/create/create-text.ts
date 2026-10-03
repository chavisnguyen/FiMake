import { ToolResult } from "tools/tool-result";
import { CreateTextParams } from "@shared/types";
import { getSolidHEXColorPaint } from "utils/get-solid-color-paint";
import { serializeText } from "serialization/serialize-text";
import { formatError } from "@shared/format-error";
import { applyTextStyle, fontLoadError, resolveFontStyle } from "../text-style";

type TextSegment = NonNullable<CreateTextParams["segments"]>[number];

/** Apply per-run overrides with setRange* (offsets into the full `text`). */
async function applySegments(
    text: TextNode,
    base: { fontName: string; fontStyle?: string; fontWeight: number; fontSize: number; fontColor: string },
    segments: TextSegment[],
): Promise<void> {
    let offset = 0;
    for (const seg of segments) {
        const start = offset;
        const end = offset + seg.text.length;
        offset = end;
        const family = seg.fontName ?? base.fontName;
        if (seg.fontName !== undefined || seg.fontWeight !== undefined || seg.fontStyle !== undefined) {
            const style = resolveFontStyle(seg.fontStyle ?? base.fontStyle, seg.fontWeight ?? base.fontWeight, "Regular");
            try {
                await figma.loadFontAsync({ family, style });
            } catch (error) {
                throw new Error(fontLoadError(family, style, formatError(error)));
            }
            text.setRangeFontName(start, end, { family, style });
        }
        if (seg.fontSize !== undefined) text.setRangeFontSize(start, end, seg.fontSize);
        if (seg.fontColor !== undefined) text.setRangeFills(start, end, [getSolidHEXColorPaint(seg.fontColor)]);
    }
}

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

    // Rich-text runs: per-segment overrides on top of the whole-node style.
    // Segments must concatenate exactly to `text` so offsets are unambiguous.
    if (args.segments && args.segments.length > 0) {
        const joined = args.segments.map((s) => s.text).join("");
        if (joined !== args.text) {
            return fail(`segments must concatenate exactly to text (got ${JSON.stringify(joined)} vs ${JSON.stringify(args.text)})`);
        }
        try {
            await applySegments(text, args, args.segments);
        } catch (error) {
            return fail(`Error setting text segments: ${formatError(error)}`);
        }
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
