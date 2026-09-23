import z from "zod";
import { CreateFrameParamsSchema } from "./create-frame";
import { CreateRectangleParamsSchema } from "./create-rectangle";
import { CreateTextParamsSchema } from "./create-text";
import { SetLayoutParamsSchema } from "../update/set-layout";
import { SetFillColorParamsSchema } from "../update/set-fill-color";
import { SetFillGradientParamsSchema } from "../update/set-fill-gradient";
import { SetStrokeColorParamsSchema } from "../update/set-stroke-color";
import { SetEffectsParamsSchema } from "../update/set-effects";
import { SetCornerRadiusParamsSchema } from "../update/set-corner-radius";
import { SetTextStyleParamsSchema } from "../update/set-text-style";
import { SetParentIdParamsSchema } from "../update/set-parent-id";

export const MAX_BATCH_OPERATIONS = 50;

const RefName = z.string().regex(/^[A-Za-z0-9_-]+$/)
    .describe("Name this op's node so later ops can use \"$<ref>\" as an id/parentId");
const IdOrRef = z.union([
    z.string().regex(/^\d*:\d*$/),
    z.string().regex(/^\$[A-Za-z0-9_-]+$/),
]).describe("Node id (page:node) or \"$ref\" of an earlier op in this batch");

function op<N extends string, S extends z.AnyZodObject>(name: N, params: S) {
    return z.object({ op: z.literal(name), ref: RefName.optional(), params });
}

// Each op reuses its tool's own schema; only id/parentId also accept "$ref".
const OperationSchema = z.discriminatedUnion("op", [
    op("create-frame", CreateFrameParamsSchema.extend({ parentId: IdOrRef.optional() })),
    op("create-rectangle", CreateRectangleParamsSchema.extend({ parentId: IdOrRef.optional() })),
    op("create-text", CreateTextParamsSchema.extend({ parentId: IdOrRef.optional() })),
    op("set-layout", SetLayoutParamsSchema.extend({ id: IdOrRef })),
    op("set-fill-color", SetFillColorParamsSchema.extend({ id: IdOrRef })),
    op("set-fill-gradient", SetFillGradientParamsSchema.extend({ id: IdOrRef })),
    op("set-stroke-color", SetStrokeColorParamsSchema.extend({ id: IdOrRef })),
    op("set-effects", SetEffectsParamsSchema.extend({ id: IdOrRef })),
    op("set-corner-radius", SetCornerRadiusParamsSchema.extend({ id: IdOrRef })),
    op("set-text-style", SetTextStyleParamsSchema.extend({ id: IdOrRef })),
    op("set-parent-id", SetParentIdParamsSchema.extend({ id: IdOrRef, parentId: IdOrRef })),
]);

export const BatchCreateParamsSchema = z.object({
    operations: z.array(OperationSchema).min(1).max(MAX_BATCH_OPERATIONS)
        .describe("Run in order in ONE plugin task. Each op is { op: <tool name>, ref?, params: <that tool's params> }"),
});

export type BatchCreateParams = z.infer<typeof BatchCreateParamsSchema>;
export type BatchOperation = BatchCreateParams["operations"][number];
