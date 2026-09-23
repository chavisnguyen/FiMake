import type { BatchCreateParams } from "@shared/types";
import { ToolResult } from "../tool-result";

export type ToolHandlers = Record<string, (args: unknown) => Promise<ToolResult>>;

interface CreatedEntry {
    index: number;
    op: string;
    ref?: string;
    id?: string;
}

const REF_KEYS = ["id", "parentId"] as const;

/**
 * Run ops sequentially through the regular tool handlers (each re-validates its
 * own params), resolving "$ref" ids from earlier ops. Stops at the first failure
 * and reports what was already created — no rollback, by design.
 */
export async function batchCreate(args: BatchCreateParams, handlers: ToolHandlers): Promise<ToolResult> {
    const refs = new Map<string, string>();
    const created: CreatedEntry[] = [];
    const fail = (index: number, op: string, reason: unknown): ToolResult => ({
        isError: true,
        content: { failedIndex: index, op, reason, created },
    });

    for (const [index, operation] of args.operations.entries()) {
        const params: Record<string, unknown> = { ...operation.params };
        for (const key of REF_KEYS) {
            const value = params[key];
            if (typeof value !== "string" || !value.startsWith("$")) continue;
            const resolved = refs.get(value.slice(1));
            if (!resolved) return fail(index, operation.op, `Unknown ref "${value}" (refs must be defined by an earlier op)`);
            params[key] = resolved;
        }
        const handler = handlers[operation.op];
        if (!handler) return fail(index, operation.op, "Unsupported op");

        const result = await handler(params);
        if (result.isError) return fail(index, operation.op, result.content);

        const id = (result.content as { id?: unknown } | null)?.id;
        const entry: CreatedEntry = { index, op: operation.op };
        if (typeof id === "string") entry.id = id;
        if (operation.ref) {
            if (refs.has(operation.ref)) return fail(index, operation.op, `Duplicate ref "${operation.ref}"`);
            if (typeof id !== "string") return fail(index, operation.op, `Op returned no node id for ref "${operation.ref}"`);
            refs.set(operation.ref, id);
            entry.ref = operation.ref;
        }
        created.push(entry);
    }
    return { isError: false, content: { created } };
}
