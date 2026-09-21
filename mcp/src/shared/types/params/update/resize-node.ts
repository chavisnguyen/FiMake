import z from "zod";

export const ResizeNodeParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    width: z.number().describe("Width"),
    height: z.number().describe("Height"),
});

export type ResizeNodeParams = z.infer<typeof ResizeNodeParamsSchema>;