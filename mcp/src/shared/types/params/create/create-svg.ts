import z from "zod";

// Plain object (no .refine): registry needs `.shape`. The exactly-one-source
// rule is enforced Node-side, which forwards only `svg` to the plugin.
export const CreateSvgParamsSchema = z.object({
    svg: z.string().optional().describe("Inline SVG markup"),
    url: z.string().optional().describe("http(s) URL of a .svg file (fetched in Node)"),
    filePath: z.string().optional().describe("Local .svg file path (read in Node)"),
    name: z.string().optional().default("SVG").describe("Name"),
    x: z.number().optional().default(0).describe("X coordinate"),
    y: z.number().optional().default(0).describe("Y coordinate"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
});

export type CreateSvgParams = z.infer<typeof CreateSvgParamsSchema>;
