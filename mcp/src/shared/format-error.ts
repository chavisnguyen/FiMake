/** JSON.stringify that never throws: circular refs become "[circular]", BigInt becomes a string. */
export function safeStringify(value: unknown): string {
    const seen = new Set<object>();
    return JSON.stringify(value, (_key, val: unknown) => {
        if (typeof val === "bigint") return `${val.toString()}n`;
        if (typeof val === "object" && val !== null) {
            if (seen.has(val)) return "[circular]";
            seen.add(val);
        }
        return val;
    });
}

/**
 * One-line error text for tool responses (never throws, never leaks stack
 * paths into the payload). Callers that need the stack log the Error object
 * itself to stderr separately (wrapToolHandler already does).
 */
export function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    try {
        return safeStringify(error);
    } catch {
        return String(error);
    }
}
