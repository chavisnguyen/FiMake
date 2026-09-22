import z from "zod";

export const CreateImageParamsSchema = z.object({
    name: z.string().optional().default("Image").describe("Name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
    x: z.number().optional().default(0).describe("X coordinate"),
    y: z.number().optional().default(0).describe("Y coordinate"),
    width: z.number().optional().default(100).describe("Width"),
    height: z.number().optional().default(100).describe("Height"),
    url: z.string().describe("Image URL"),
    // Internal: MCP fetches `url` in Node and forwards raw bytes to the plugin.
    // Must stay in the shared schema — plugin dispatch validates with this schema
    // via zod safeParse which strips unknown keys. Without this field, imageData
    // was silently dropped, plugin got `new Uint8Array(undefined)` (empty bytes)
    // and figma.createImage() threw "Image type is unsupported" for every URL.
    imageData: z.array(z.number()).optional().describe("Internal: fetched image bytes (Node -> plugin)"),
});

export type CreateImageParams = z.infer<typeof CreateImageParamsSchema>;