import { z } from "zod";

export const CreateComponentParamsSchema = z.object({
    name: z.string().describe("Component name"),
    parentId: z.string().regex(/^\d*:\d*$/).optional().describe("Parent node id (page:node)"),
});

export type CreateComponentParams = z.infer<typeof CreateComponentParamsSchema>;