import { z } from "zod";

export const SetParentIdParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    parentId: z.string().regex(/^\d*:\d*$/).describe("Parent node id (page:node)"),
});

export type SetParentIdParams = z.infer<typeof SetParentIdParamsSchema>;