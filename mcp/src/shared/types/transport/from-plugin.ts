import { z } from "zod";

export const FromPluginMessageSchema = z.object({
    taskId: z.string().min(1),
    isError: z.boolean(),
    content: z.unknown(),
});

export type FromPluginMessage = z.infer<typeof FromPluginMessageSchema>; 