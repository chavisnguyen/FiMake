import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";
import { TextStyleFields } from "../shared/text-style";

export const CreateTextParamsSchema = z.object({
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    text: z.string().describe("Text"),
    fontSize: z.number().optional().default(14).describe("Font size"),
    fontName: z.string().optional().default("Inter").describe("Font family (see list-fonts)"),
    fontWeight: z.number().optional().default(400).describe("Font weight 100-900 (mapped to a style name; use fontStyle for exact names)"),
    fontColor: ColorHexSchema.optional().default("#000000FF").describe("Font color"),
    name: z.string().optional().default("Text").describe("Name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
    ...TextStyleFields,
});

export type CreateTextParams = z.infer<typeof CreateTextParamsSchema>;
