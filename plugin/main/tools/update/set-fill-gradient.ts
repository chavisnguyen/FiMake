import { SetFillGradientParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { convertToRGBA } from "utils/color-conversion";
import { withNode } from "../node-helper";

/**
 * Figma's gradientTransform maps node space (0..1) to gradient space, where the
 * gradient runs along x. Rotating about the center by `degrees` gives
 * 0 = left-to-right, 90 = top-to-bottom (Figma's y axis points down).
 */
export function gradientTransform(degrees: number): Transform {
    const rad = (degrees * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [
        [c, s, 0.5 - 0.5 * c - 0.5 * s],
        [-s, c, 0.5 + 0.5 * s - 0.5 * c],
    ];
}

export async function setFillGradient(args: SetFillGradientParams): Promise<ToolResult> {
    const gradientStops: ColorStop[] = [...args.stops]
        .sort((a, b) => a.position - b.position)
        .map(({ position, color }) => {
            const { r, g, b, a } = convertToRGBA(color);
            return { position, color: { r, g, b, a: a ?? 1 } };
        });
    const paint: GradientPaint = {
        type: args.type === "RADIAL" ? "GRADIENT_RADIAL" : "GRADIENT_LINEAR",
        gradientTransform: args.type === "RADIAL" ? gradientTransform(0) : gradientTransform(args.angle),
        gradientStops,
    };
    return withNode(args.id, (node) => {
        if (!("fills" in node)) throw new Error("Node does not have a fills property");
        (node as unknown as { fills: Paint[] }).fills = [paint];
    });
}
