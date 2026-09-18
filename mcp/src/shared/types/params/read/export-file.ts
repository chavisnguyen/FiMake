import { z } from "zod";

export const ExportFileParamsSchema = z.object({
    // Absolute (or cwd-relative) directory to write the export into.
    // Defaults to `<cwd>/exports/export-<timestamp>`.
    outputDir: z.string().optional(),
    // Forwarded to get-node-info for each top-level frame. Default 5000.
    maxNodes: z.coerce.number().int().min(1).max(100000).optional(),
    // Forwarded to get-node-info for each top-level frame. Default 35000.
    maxChars: z.coerce.number().int().min(1000).max(150000).optional(),
});

export type ExportFileParams = z.infer<typeof ExportFileParamsSchema>;
