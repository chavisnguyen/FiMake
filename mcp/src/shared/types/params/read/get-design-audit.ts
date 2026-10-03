import z from "zod";

export const GetDesignAuditParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node) — the frame/section to audit with its subtree"),
    maxIssues: z.number().int().positive().max(200).optional().default(50).describe("Max issues returned (scan still covers the whole capped subtree)"),
});

export type GetDesignAuditParams = z.infer<typeof GetDesignAuditParamsSchema>;
export type GetDesignAuditInput = z.input<typeof GetDesignAuditParamsSchema>;
