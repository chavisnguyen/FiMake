import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskManager } from "../../bridge/task-manager";

export function getSelection(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get-selection",
        "Get the current selection in Figma.",
        {},
        async () => {
            const result = await taskManager.runTask("get-selection", {});
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result)
                }],
                isError: false
            }  as CallToolResult;
        }
    );
}