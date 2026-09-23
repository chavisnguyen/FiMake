import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";
import { TextStyleFields } from "../shared/text-style";

export const SetTextStyleParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Text node id (page:node)"),
    fontSize: z.number().positive().optional().describe("Font size"),
    fontName: z.string().optional().describe("Font family (see list-fonts)"),
    fontWeight: z.number().optional().describe("Font weight 100-900 (use fontStyle for exact style names)"),
    fontColor: ColorHexSchema.optional().describe("Font color"),
    ...TextStyleFields,
});

export type SetTextStyleParams = z.infer<typeof SetTextStyleParamsSchema>;
