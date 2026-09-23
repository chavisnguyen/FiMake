import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

const ShadowSchema = z.object({
    type: z.enum(["DROP_SHADOW", "INNER_SHADOW"]),
    color: ColorHexSchema.describe("Shadow color incl. alpha, e.g. #00000040"),
    offset: z.object({ x: z.number(), y: z.number() }).optional().default({ x: 0, y: 4 }),
    radius: z.number().min(0).optional().default(4).describe("Blur radius px"),
    spread: z.number().optional().default(0),
});

const BlurSchema = z.object({
    type: z.enum(["LAYER_BLUR", "BACKGROUND_BLUR"]),
    radius: z.number().min(0).describe("Blur radius px"),
});

export const SetEffectsParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    effects: z.array(z.union([ShadowSchema, BlurSchema])).max(8)
        .describe("Replaces ALL effects on the node, in order. [] clears them"),
});

export type SetEffectsParams = z.infer<typeof SetEffectsParamsSchema>;
