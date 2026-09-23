import z from "zod";

export const ListFontsParamsSchema = z.object({
    family: z.string().optional()
        .describe("Case-insensitive family substring, e.g. \"sf pro\". With it: families + their style names. Without: family names only"),
});

export type ListFontsParams = z.infer<typeof ListFontsParamsSchema>;
