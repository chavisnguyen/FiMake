import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";

export function getSelection(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "get-selection",
        "Get the current selection in Figma. Accepts targetFileKey/targetFileName to read one open file (see list-clients); omit to broadcast.",
        withTarget({}),
        async (params: TargetParams = {}) => {
            return await safeToolProcessor(
                taskManager.runTask("get-selection", params)
            );
        }
    );
}