import { z } from "zod";

export const SetParentIdParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    parentId: z.string().regex(/^\d*:\d*$/).describe("Parent node id (page:node)"),
    index: z.number().int().min(0).optional()
        .describe("Position among the parent's children (0 = first = bottom of z-order). Omit = append. Same parent = reorder"),
    absolute: z.boolean().optional()
        .describe("true = ABSOLUTE positioning inside an auto-layout parent (overlay, place with move-node); false = back to AUTO flow"),
});

export type SetParentIdParams = z.infer<typeof SetParentIdParamsSchema>;
