import type { BatchCreateInput } from "@shared/types";
import { ToolResult } from "../tool-result";

export type ToolHandlers = Record<string, (args: unknown) => Promise<ToolResult>>;

interface CreatedEntry {
    index: number;
    op: string;
    ref?: string;
    id?: string;
}

const REF_KEYS = ["id", "parentId", "componentId", "instanceId", "nodeId", "destinationId"] as const;

/**
 * Run ops sequentially through the regular tool handlers (each re-validates its
 * own params), resolving "$ref" ids from earlier ops. Stops at the first failure
 * and reports what was already created. With `atomic: true`, created nodes are
 * removed again (best-effort) instead of leaving a half-built subtree.
 */
export async function batchCreate(args: BatchCreateInput, handlers: ToolHandlers): Promise<ToolResult> {
    const refs = new Map<string, string>();
    const created: CreatedEntry[] = [];
    const atomic = args.atomic ?? false;
    const fail = async (index: number, op: string, reason: unknown, hint?: string): Promise<ToolResult> => {
        if (!atomic) {
            return {
                isError: true,
                content: { failedIndex: index, op, reason, created, ...(hint ? { hint } : {}) },
            };
        }
        const rollbackErrors: string[] = [];
        let rolledBack = 0;
        for (const entry of [...created].reverse()) {
            if (!entry.id) continue;
            try {
                const node = await figma.getNodeByIdAsync(entry.id);
                if (node && "remove" in node && typeof (node as { remove: unknown }).remove === "function") {
                    (node as unknown as { remove: () => void }).remove();
                    rolledBack += 1;
                }
            } catch (error) {
                rollbackErrors.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return {
            isError: true,
            content: {
                failedIndex: index, op, reason, created,
                atomic: true, rolledBack,
                ...(rollbackErrors.length > 0 ? { rollbackErrors } : {}),
                ...(hint ? { hint } : {}),
            },
        };
    };

    for (const [index, operation] of args.operations.entries()) {
        const params: Record<string, unknown> = { ...operation.params };
        for (const key of REF_KEYS) {
            const value = params[key];
            if (typeof value !== "string" || !value.startsWith("$")) continue;
            const resolved = refs.get(value.slice(1));
            if (!resolved) {
                const known = [...refs.keys()].map((r) => `"${r}"`).join(", ") || "(no refs defined yet)";
                return fail(index, operation.op, `Unknown ref "${value}" (refs must be defined by an earlier op)`, `Defined refs so far: ${known}.`);
            }
            params[key] = resolved;
        }
        // Duplicate refs fail BEFORE the handler runs (no wasted tool call).
        if (operation.ref && refs.has(operation.ref)) {
            return fail(index, operation.op, `Duplicate ref "${operation.ref}"`, "Each ref name must be unique within the batch.");
        }
        const handler = handlers[operation.op];
        if (!handler) {
            return fail(index, operation.op, `Unsupported op "${operation.op}"`, `Supported ops: ${Object.keys(handlers).sort().join(", ")}.`);
        }

        const result = await handler(params);
        if (result.isError) return fail(index, operation.op, result.content);

        const id = (result.content as { id?: unknown } | null)?.id;
        const entry: CreatedEntry = { index, op: operation.op };
        if (typeof id === "string") entry.id = id;
        if (operation.ref) {
            if (typeof id !== "string") return fail(index, operation.op, `Op returned no node id for ref "${operation.ref}"`);
            refs.set(operation.ref, id);
            entry.ref = operation.ref;
        }
        created.push(entry);
    }
    return { isError: false, content: { created } };
}
