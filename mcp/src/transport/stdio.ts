import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge, createMcpServer } from '../bridge/server';
import { config } from '../config/config';
import http from 'http';
import { createSocketServer } from './socket-server';
import { listenWithFriendlyError } from './listen';

export async function startSTDIO() {
    try {
        // Only /health: lets `fimake doctor` recognise a stdio-spawned server
        // (otherwise every non-Socket.IO request hangs until timeout).
        const httpServer = http.createServer((req, res) => {
            const health = req.url?.split("?")[0] === "/health";
            const body = health
                ? { ok: true, port: config.PORT, transport: "stdio", clients: socketManager.getClients() }
                : { error: "not found" };
            res.writeHead(health ? 200 : 404, { "Content-Type": "application/json" }).end(JSON.stringify(body));
        });
        const socketServer = createSocketServer(httpServer);

        const { taskManager, socketManager } = createBridge(socketServer);
        const server = createMcpServer(taskManager, socketManager);
        const transport = new StdioServerTransport();
        await server.connect(transport);
        // Client gone (stdin closed) → exit, or the HTTP listener keeps this
        // process alive as an orphan holding PORT.
        process.stdin.on("close", () => process.exit(0));

        // Start HTTP server for Socket.IO connections from Figma plugin
        listenWithFriendlyError(httpServer, config.PORT, "Socket.IO server");
    } catch (error) {
        console.error('Error starting STDIO server:', error);
        throw error;
    }
}
