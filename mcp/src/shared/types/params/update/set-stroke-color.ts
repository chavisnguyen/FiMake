import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetStrokeColorParamsSchema = z.object({
    id: z.string().describe("Node id"),
    color: ColorHexSchema,
});

export type SetStrokeColorParams = z.infer<typeof SetStrokeColorParamsSchema>;