import { Hono } from "hono";
import { cors } from "hono/cors";
import { getRequestListener } from "@hono/node-server";
import { createBridge } from "../bridge/server";
import { config } from "../config/config";
import { infoLog } from "../shared/log";
import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import { createSocketServer } from "./socket-server";
import { McpSessionStore } from "./mcp-sessions";

export async function startStreamableHTTP() {
    const app = new Hono();

    // CORS locked to config (default "*" for local dev).
    app.use(cors({
        origin: config.CORS_ORIGIN,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "mcp-session-id"],
    }));

    // Health is set up after bridge is created below (needs live counts),
    // but register a placeholder now so Hono has the route; handler reads
    // from the mutable holder.
    const healthHolder: { bridge?: ReturnType<typeof createBridge>; store?: McpSessionStore } = {};
    app.get("/health", (c) => c.json({
        ok: true,
        port: config.PORT,
        transport: config.TRANSPORT,
        pendingTasks: healthHolder.bridge?.taskManager.getPendingCount(),
        queuedMessages: healthHolder.bridge?.socketManager.getPendingCount(),
        sessions: healthHolder.store?.size,
        pluginConnected: (healthHolder.bridge?.socketManager as unknown as { sockets?: Set<unknown> })?.sockets !== undefined
            ? ((healthHolder.bridge?.socketManager as unknown as { sockets: Set<unknown> }).sockets.size > 0)
            : undefined,
    }));

    // Single shared Figma bridge (one plugin socket namespace).
    const sessionsPlaceholder = { store: null as McpSessionStore | null };

    // Raw-first routing: /mcp goes straight to the framework-free session
    // store on raw req/res (the MCP transport owns the response, including
    // SSE streams — no Hono Context involved). Everything else falls
    // through to Hono. Socket.IO attaches to the same raw server.
    const honoListener = getRequestListener((req, env) => app.fetch(req, env));
    const httpServer: HttpServer = createServer((req, res) => {
        if (req.url?.split("?")[0] === "/mcp" && sessionsPlaceholder.store) {
            void sessionsPlaceholder.store.handle(req, res);
            return;
        }
        void honoListener(req, res);
    });
    const io = createSocketServer(httpServer);
    const bridge = createBridge(io);
    const store = new McpSessionStore(bridge);
    sessionsPlaceholder.store = store;
    healthHolder.bridge = bridge;
    healthHolder.store = store;

    // Start the HTTP server (Socket.IO shares this port).
    httpServer.listen(config.PORT, () => {
        infoLog(`Server listening on http://localhost:${config.PORT}`);
    });
}
