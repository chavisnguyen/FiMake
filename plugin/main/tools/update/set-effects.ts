import { SetEffectsParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { convertToRGBA } from "utils/color-conversion";
import { withNode } from "../node-helper";

type EffectInput = SetEffectsParams["effects"][number];

function toFigmaEffect(e: EffectInput): Effect {
    if (!("color" in e)) {
        return { type: e.type, radius: e.radius, visible: true, blurType: "NORMAL" };
    }
    const { r, g, b, a } = convertToRGBA(e.color);
    return {
        type: e.type,
        color: { r, g, b, a: a ?? 1 },
        offset: e.offset,
        radius: e.radius,
        spread: e.spread,
        visible: true,
        blendMode: "NORMAL",
    };
}

export async function setEffects(args: SetEffectsParams): Promise<ToolResult> {
    return withNode(args.id, (node) => {
        if (!("effects" in node)) throw new Error("Node does not have an effects property");
        (node as unknown as { effects: Effect[] }).effects = args.effects.map(toFigmaEffect);
    });
}
