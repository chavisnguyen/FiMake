import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge, createMcpServer } from '../bridge/server';
import { config } from '../config/config';
import http from 'http';
import { createSocketServer } from './socket-server';
import { listenWithFriendlyError } from './listen';

export async function startSTDIO() {
    try {
        const httpServer = http.createServer();
        const socketServer = createSocketServer(httpServer);

        const { taskManager, socketManager } = createBridge(socketServer);
        const server = createMcpServer(taskManager, socketManager);
        const transport = new StdioServerTransport();
        await server.connect(transport);

        // Start HTTP server for Socket.IO connections from Figma plugin
        listenWithFriendlyError(httpServer, config.PORT, "Socket.IO server");
    } catch (error) {
        console.error('Error starting STDIO server:', error);
        throw error;
    }
}
