import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "../config/config";
import { debugLog } from "../shared/log";

/** Shared Socket.IO options so stdio + streamable-http can't drift apart. */
let corsWarningLogged = false;
export function createSocketServer(httpServer: HttpServer): Server {
    // Warn here (not in config.ts module scope) so `--version` stays silent
    // while both real server paths still warn exactly once.
    if (config.CORS_ORIGIN === "*" && !corsWarningLogged) {
        corsWarningLogged = true;
        console.warn('[fimake] CORS_ORIGIN="*" allows any origin; set it explicitly for networked use.');
    }
    const io = new Server(httpServer, {
        cors: {
            origin: config.CORS_ORIGIN,
            methods: ["GET", "POST", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id"],
            credentials: false,
        },
        // Socket.IO needs polling for the initial handshake.
        transports: ["polling", "websocket"],
        allowUpgrades: true,
        cookie: false,
        serveClient: false,
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on("connection", (socket) => {
        try {
            debugLog("a user connected:", socket.id);
            socket.on("disconnect", (reason) => {
                try {
                    debugLog("a user disconnected:", socket.id, reason);
                } catch (error) {
                    console.error("Error in disconnect handler:", error);
                }
            });
            socket.on("error", (error) => {
                console.error("Socket error:", error);
            });
        } catch (error) {
            console.error("Error in connection handler:", error);
        }
    });

    io.engine.on("connection_error", (err) => {
        console.error("Socket.IO connection error:", err);
    });

    return io;
}
