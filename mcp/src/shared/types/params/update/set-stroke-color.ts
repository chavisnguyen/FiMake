import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetStrokeColorParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    color: ColorHexSchema,
});

export type SetStrokeColorParams = z.infer<typeof SetStrokeColorParamsSchema>;