import { convertToHex } from "utils/color-conversion";

export interface SerializedText {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    fontSize: unknown;
    fontName: unknown;
    fontColor?: string;
    parentId?: string;
}

export function serializeText(text: TextNode): SerializedText {
    const fills = text.fills as Paint[];
    const firstSolid = Array.isArray(fills) ? fills.find((f) => f.type === "SOLID") : undefined;
    return {
        id: text.id,
        x: text.x,
        y: text.y,
        width: text.width,
        height: text.height,
        name: text.name,
        fontSize: text.fontSize,
        fontName: text.fontName,
        fontColor: firstSolid ? convertToHex(firstSolid.color) : undefined,
        parentId: text.parent ? `${text.parent.id}:${text.parent.type}` : undefined
    };
}
