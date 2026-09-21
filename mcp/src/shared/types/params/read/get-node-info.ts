import { z } from "zod";

export const GetNodeInfoParamsSchema = z.object({
    id: z.string().regex(/^\d*:\d*$/).describe("Node id (page:node)"),
    // How many levels of children to serialize inline.
    //   0  = only this node (children returned as id/name/type stubs)
    //   N  = N levels deep
    //  -1  = FULL / unlimited — recurse to every leaf (bounded only by maxNodes)
    // Any node that is NOT fully expanded (hit the depth limit or the maxNodes
    // budget) is marked `childrenTruncated: true`, so nothing is ever dropped
    // silently — re-request that node's id (with higher depth) to cover it.
    depth: z.coerce.number().int().min(-1).optional(),
    // Safety budget: max number of nodes to fully serialize in one response.
    // When exhausted, remaining siblings become stubs marked `_truncated: true`
    // and their parent gets `childrenTruncated: true`. Default 10000.
    maxNodes: z.coerce.number().int().min(1).max(100000).optional(),
    // Char budget: stop expanding once the serialized output reaches this size,
    // so the response stays returnable inline (no giant blob). Default 35000
    // (stays under the tool-result token cap). Overflow branches are flagged
    // exactly like maxNodes, and
    // the root gets `_truncatedCount` = how many branches were cut by budget.
    // When it appears, re-request those flagged node ids to cover the rest.
    maxChars: z.coerce.number().int().min(1000).max(150000).optional(),
    // Optional whitelist of field groups to include, to trim the payload
    // further. Valid groups: "geometry", "layout", "fills", "strokes",
    // "effects", "text", "component", "children". Omit to include all.
    fields: z.array(z.string()).optional(),
});

export type GetNodeInfoParams = z.infer<typeof GetNodeInfoParamsSchema>;
