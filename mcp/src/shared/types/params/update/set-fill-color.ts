import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetFillColorParamsSchema = z.object({
    id: z.string().describe("Node id"),
    color: ColorHexSchema,
});

export type SetFillColorParams = z.infer<typeof SetFillColorParamsSchema>;