import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetStrokeColorParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    color: ColorHexSchema,
    weight: z.number().min(0).optional().describe("Stroke weight in px (omit = keep current)"),
    align: z.enum(["INSIDE", "OUTSIDE", "CENTER"]).optional().describe("Stroke alignment (omit = keep current)"),
});

export type SetStrokeColorParams = z.infer<typeof SetStrokeColorParamsSchema>;
