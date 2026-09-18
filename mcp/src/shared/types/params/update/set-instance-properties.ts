import { z } from "zod";

export const SetInstancePropertiesParamsSchema = z.object({
    instanceId: z.string().regex(/^\d*:\d*$/).describe("Instance id (page:node)"),
    properties: z.record(z.string(), z.unknown()).describe("Properties"),
});

export type SetInstancePropertiesParams = z.infer<typeof SetInstancePropertiesParamsSchema>;