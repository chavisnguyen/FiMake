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

export function formatError(error: unknown): string {
    if (error instanceof Error) {
        // Keep the stack for real debugging — message alone hides where it threw.
        return error.stack ?? error.message;
    }
    try {
        return safeStringify(error);
    } catch {
        return String(error);
    }
}
