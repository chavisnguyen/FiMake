import { z } from "zod";

export const SetNodeComponentPropertyReferencesParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    // partialRecord: Figma accepts a SUBSET of references (v3 z.record(enum)
    // inferred Partial; v4 z.record(enum) requires every key — that would
    // newly reject `{characters: "p"}` at runtime, so keep v3 semantics).
    componentPropertyReferences: z.partialRecord(z.enum(['characters', 'visible', 'mainComponent']), z.string()).describe("Component property references"),
});

export type SetNodeComponentPropertyReferencesParams = z.infer<typeof SetNodeComponentPropertyReferencesParamsSchema>;