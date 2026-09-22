import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SocketManager } from "../../transport/socket-manager";

/**
 * Node-only by design (like export-file): reads server-side connection
 * state, so there is intentionally NO handler in
 * plugin/main/tools/dispatch.ts.
 *
 * Multi-window workflow: call this first, pick the file you want by
 * `fileKey` (stable) or `fileName` (human), then pass it as
 * `targetFileKey` / `targetFileName` on any other tool. Omit the target
 * to broadcast to every open file (old behavior).
 */
export function listClients(server: McpServer, socketManager: SocketManager) {
    server.tool(
        "list-clients",
        "List open Figma files with the Fimake plugin connected (one entry per plugin window: fileName, fileKey, connectedAt). Call this first in multi-window sessions, then pin tasks with targetFileKey (stable id, preferred) or targetFileName on any other tool. Omit the target to broadcast to all windows.",
        {},
        async () => {
            const clients = socketManager.getClients();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ count: clients.length, clients }),
                }],
                isError: false,
            } as CallToolResult;
        }
    );
}
