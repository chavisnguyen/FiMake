import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetFillGradientParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    type: z.enum(["LINEAR", "RADIAL"]).optional().default("LINEAR"),
    stops: z.array(z.object({
        position: z.number().min(0).max(1).describe("0..1 along the gradient"),
        color: ColorHexSchema,
    })).min(2).max(16),
    angle: z.number().optional().default(0)
        .describe("LINEAR only, degrees: 0 = left-to-right, 90 = top-to-bottom, 180 = right-to-left"),
});

export type SetFillGradientParams = z.infer<typeof SetFillGradientParamsSchema>;
