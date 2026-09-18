import z from "zod";

export const DeleteComponentPropertyParamsSchema = z.object({
    componentId: z.string().regex(/^\d*:\d*$/).describe("Component id (page:node)"),
    name: z.string().describe("Property name"),
});

export type DeleteComponentPropertyParams = z.infer<typeof DeleteComponentPropertyParamsSchema>;