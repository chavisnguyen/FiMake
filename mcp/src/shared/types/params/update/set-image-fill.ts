import z from "zod";

export const SetImageFillParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node) whose fill becomes the image"),
    url: z.string().describe("http(s) JPG/PNG/GIF URL (fetched in Node, same guards as create-image)"),
    scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional().default("FILL"),
    // Internal: MCP fetches `url` in Node and forwards bytes. Must stay in the
    // shared schema — plugin dispatch safeParse strips unknown keys.
    imageData: z.array(z.number()).optional().describe("Internal: fetched image bytes (Node -> plugin)"),
});

export type SetImageFillParams = z.infer<typeof SetImageFillParamsSchema>;
