import { z } from "zod";

export const ExportAssetParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    // "SVG" (default) returns real path data as ready-to-use markup — always
    // prefer this over reconstructing icon paths by hand from get-node-info,
    // since get-node-info deliberately omits vector geometry.
    // "PNG"/"JPG" return a base64-encoded raster image instead.
    format: z.enum(["SVG", "PNG", "JPG"]).optional(),
    // Raster-only. Scale factor applied to the node's own size. Ignored for SVG.
    scale: z.coerce.number().positive().max(4).optional(),
    // Absolute (or cwd-relative) file path to write the export to directly.
    // When set, the tool writes the asset to disk itself (decoding base64 for
    // PNG/JPG, raw text for SVG) and returns only { path, bytes } instead of
    // the full asset data inline.
    outputPath: z.string().optional(),
});

export type ExportAssetParams = z.infer<typeof ExportAssetParamsSchema>;
