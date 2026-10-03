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
        // Cap the wire frame: image bytes already travel as JSON arrays, so
        // this must fit the biggest legit payload (export-asset PNG scale 4)
        // with headroom — it stops absurd OOMs, not crafted ones (see
        // MAX_PLUGIN_PAYLOAD_JSON for the per-message content cap).
        // NOTE: no auth token here by design yet — the bridge is
        // loopback-filtered (see listen.ts) and a token would have to be
        // injected into the Figma manifest at build time. Tracked in P4 plan
        // Phase 3 as the follow-up once loopback-only is insufficient.
        maxHttpBufferSize: 64 * 1024 * 1024,
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
