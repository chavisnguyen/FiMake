import { ToolResult } from "./tool-result";
import { formatError } from "@shared/format-error";

export function safeToolProcessor<T>(tool: (args: T) => Promise<ToolResult> ) {
    return async (args: T) => {
        try {
            return await tool(args);
        } catch (error) {
            console.error(error);
            return {
                isError: true,
                content: formatError(error)
            };
        }
    }
}
