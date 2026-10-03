import { z } from "zod";

/**
 * Cap on inbound plugin payloads (JSON length). export-asset raster at
 * scale 4 stays well under this; anything bigger is a malfunctioning or
 * hostile client — settle the task as failed instead of OOMing the server.
 */
export const MAX_PLUGIN_PAYLOAD_JSON = 48 * 1024 * 1024;

export const FromPluginMessageSchema = z.object({
    taskId: z.string().min(1).max(200),
    isError: z.boolean(),
    content: z.unknown(),
}).superRefine((msg, ctx) => {
    let size = -1;
    try {
        size = JSON.stringify(msg.content)?.length ?? -1;
    } catch {
        size = -1;
    }
    if (size > MAX_PLUGIN_PAYLOAD_JSON) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `plugin payload exceeds ${MAX_PLUGIN_PAYLOAD_JSON} bytes`,
        });
    }
});

export type FromPluginMessage = z.infer<typeof FromPluginMessageSchema>; 