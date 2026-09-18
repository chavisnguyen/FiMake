import z from "zod";

export const EditComponentPropertyParamsSchema = z.object({
    componentId: z.string().regex(/^\d*:\d*$/).describe("Component id (page:node)"),
    name: z.string().describe("Property name"),
    type: z.enum(['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT']).describe("Property type"),
    defaultValue: z.string().describe("Default property value"),
    preferredValues: z.array(z.string()).optional().describe("Preferred values"),
});

export type EditComponentPropertyParams = z.infer<typeof EditComponentPropertyParamsSchema>;