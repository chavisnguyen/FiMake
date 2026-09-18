import z from "zod";

export const CreateImageParamsSchema = z.object({
    name: z.string().optional().default("Image").describe("Name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
    x: z.number().optional().default(0).describe("X coordinate"),
    y: z.number().optional().default(0).describe("Y coordinate"),
    width: z.number().optional().default(100).describe("Width"),
    height: z.number().optional().default(100).describe("Height"),
    url: z.string().describe("Image URL"),
});

export type CreateImageParams = z.infer<typeof CreateImageParamsSchema>;