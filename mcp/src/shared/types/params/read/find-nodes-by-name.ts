import z from "zod";

export const FindNodesByNameParamsSchema = z.object({
    name: z.string().min(1).describe("Node name to search (substring unless exact:true)"),
    exact: z.boolean().optional().default(false).describe("Match the full name exactly instead of substring"),
    limit: z.number().int().positive().max(200).optional().default(50).describe("Max matches (whole file is scanned)"),
});

export type FindNodesByNameParams = z.infer<typeof FindNodesByNameParamsSchema>;
export type FindNodesByNameInput = z.input<typeof FindNodesByNameParamsSchema>;
