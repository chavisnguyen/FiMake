import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskResult } from "../bridge/task-manager";
import { formatError } from "../shared/format-error";

export async function safeToolProcessor(task: Promise<TaskResult>): Promise<CallToolResult> {
    try {
        const result = await task;
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result.content)
            }],
            isError: result.isError
        } as CallToolResult;
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: formatError(error)
            }],
            isError: true
        } as CallToolResult;
    }

}