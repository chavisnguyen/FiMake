import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const SetFillColorParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    color: ColorHexSchema,
});

export type SetFillColorParams = z.infer<typeof SetFillColorParamsSchema>;