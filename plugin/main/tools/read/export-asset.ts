import type { ExportAssetParams } from "@shared/types";
import { ToolResult } from "../tool-result";

export async function exportAsset(args: ExportAssetParams): Promise<ToolResult> {
    const node = await figma.getNodeByIdAsync(args.id);
    if (!node) {
        return { isError: true, content: "Node not found" };
    }
    if (!("exportAsync" in node)) {
        return { isError: true, content: `Node type "${node.type}" does not support export` };
    }

    const exportable = node as SceneNode & ExportMixin;
    const format = args.format ?? "SVG";

    try {
        if (format === "SVG") {
            const svg = await exportable.exportAsync({
                format: "SVG_STRING",
                svgOutlineText: true,
                svgIdAttribute: false,
                svgSimplifyStroke: true,
            });
            return {
                isError: false,
                content: {
                    id: node.id,
                    name: node.name,
                    format: "SVG",
                    mimeType: "image/svg+xml",
                    data: svg,
                },
            };
        }

        const bytes = await exportable.exportAsync({
            format,
            constraint: { type: "SCALE", value: args.scale ?? 1 },
        });
        return {
            isError: false,
            content: {
                id: node.id,
                name: node.name,
                format,
                mimeType: format === "JPG" ? "image/jpeg" : "image/png",
                data: figma.base64Encode(bytes),
            },
        };
    } catch (e) {
        return { isError: true, content: e instanceof Error ? e.message : String(e) };
    }
}
