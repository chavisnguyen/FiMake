import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config/config";
import { TaskManager } from "./task-manager";
import type { Server } from "socket.io";
import { SocketManager } from "../transport/socket-manager";
import { Orchestrator } from "./orchestrator";
import { registerAllTools } from "../tools/registry";

declare const __PACKAGE_VERSION__: string;

// Single source: mcp/package.json version, injected by tsdown at build.
// (vitest replaces it via define below; test parity locks all copies.)
export const SERVER_VERSION: string =
  typeof __PACKAGE_VERSION__ !== "undefined" ? __PACKAGE_VERSION__ : "0.0.0-test";

export interface FigmaBridge {
    taskManager: TaskManager;
    socketManager: SocketManager;
    orchestrator: Orchestrator;
}

/**
 * Single shared bridge to the Figma plugin. There is exactly one plugin
 * socket namespace, so exactly one TaskManager/SocketManager pair must own
 * it — otherwise two managers would race to resolve the same taskId.
 */
export function createBridge(server: Server): FigmaBridge {
    const taskManager = new TaskManager(config.TASK_TIMEOUT_MS);
    const socketManager = new SocketManager(server, config.TASK_ACK_TIMEOUT_MS);
    const orchestrator = new Orchestrator(socketManager, taskManager);
    return { taskManager, socketManager, orchestrator };
}

/** One MCP protocol server per client session, all sharing the same bridge. */
export function createMcpServer(taskManager: TaskManager, socketManager?: SocketManager): McpServer {
    const mcpServer = new McpServer({
        name: `Fimake`,
        version: SERVER_VERSION,
    });

    registerAllTools(mcpServer, taskManager, socketManager);

    return mcpServer;
}
