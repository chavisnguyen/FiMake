import { z } from "zod";

export const GetAllComponentsParamsSchema = z.object({
});

export type GetAllComponentsParams = z.infer<typeof GetAllComponentsParamsSchema>;