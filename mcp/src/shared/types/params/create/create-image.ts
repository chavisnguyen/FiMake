import z from "zod";

export const CreateImageParamsSchema = z.object({
    name: z.string().optional().default("Image").describe("Name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
    x: z.number().optional().default(0).describe("X coordinate"),
    y: z.number().optional().default(0).describe("Y coordinate"),
    width: z.number().optional().default(100).describe("Width"),
    height: z.number().optional().default(100).describe("Height"),
    url: z.string().describe("Image URL"),
    // Internal: MCP fetches `url` in Node and forwards bytes to the plugin
    // as BASE64 (not a number array: JSON arrays bloat ~3-4x on the socket).
    // Must stay in the shared schema — plugin dispatch validates with this schema
    // via zod safeParse which strips unknown keys. Without this field, imageData
    // was silently dropped and figma.createImage() threw for every URL.
    imageData: z.string().optional().describe("Internal: fetched image bytes as base64 (Node -> plugin)"),
});

export type CreateImageParams = z.infer<typeof CreateImageParamsSchema>;