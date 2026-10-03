import z from "zod";
import { ColorHexSchema } from "../shared/color-hex";

export const CreateCardParamsSchema = z.object({
    x: z.number().optional().default(0).describe("X coordinate"),
    y: z.number().optional().default(0).describe("Y coordinate"),
    width: z.number().positive().optional().default(320).describe("Card width (height hugs content)"),
    title: z.string().min(1).describe("Card title"),
    titleSize: z.number().positive().optional().default(18).describe("Title font size"),
    meta: z.string().optional().describe("Secondary line under the title (venue, date, …)"),
    price: z.string().optional().describe("Price line (rendered bold)"),
    buttonLabel: z.string().optional().describe("Call-to-action label (no button when omitted)"),
    buttonColor: ColorHexSchema.optional().default("#0A84FFFF").describe("Button fill"),
    background: ColorHexSchema.optional().default("#FFFFFFFF").describe("Card background"),
    radius: z.number().min(0).optional().default(12).describe("Card corner radius"),
    imageUrl: z.string().optional().describe("Optional header image (JPG/PNG/GIF, fetched in Node like create-image)"),
    imageHeight: z.number().positive().optional().default(160).describe("Header image height"),
    name: z.string().optional().default("Card").describe("Card frame name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
});

export type CreateCardParams = z.infer<typeof CreateCardParamsSchema>;
