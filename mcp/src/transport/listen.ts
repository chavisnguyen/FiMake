import type { Server as HttpServer } from "node:http";
import { config } from "../config/config";
import { infoLog } from "../shared/log";

/**
 * Port conflict is the #1 setup footgun: with `stdio` transport the MCP
 * client spawns its own server, so a hand-started server (`pnpm start`)
 * on the same PORT makes the spawned one crash with a raw EADDRINUSE
 * stack. Catch it here and say what to do instead.
 *
 * Logs go to STDERR (never stdout — stdout is the JSON-RPC stream in
 * `stdio` mode) and the process exits 1 so the client reports a clean
 * failure with our message attached.
 */
export function isAddrInUse(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "EADDRINUSE"
    );
}

export function friendlyPortMessage(port: number): string {
    return (
        `[fimake] Port ${port} is already in use — another Fimake server is probably running.\n` +
        `[fimake] Two servers can't share this port: e.g. \`brew services\` is running AND a client still spawns \`fimake\` (stdio), or two stdio clients at once.\n` +
        `[fimake] Fix: run one shared server (\`brew services start fimake\`) and point every client at http://localhost:${port}/mcp.\n` +
        `[fimake] Run \`fimake doctor\` to see who holds the port.`
    );
}

/** Loopback only: 127.0.0.1, ::1 and IPv4-mapped ::ffff:127.x. */
export function isLoopback(address: string | undefined): boolean {
    if (!address) return false;
    return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

/** Drop-in replacement for `httpServer.listen(port, cb)` with the guard above. */
export function listenWithFriendlyError(httpServer: HttpServer, port: number, label: string): void {
    httpServer.on("error", (err: unknown) => {
        if (isAddrInUse(err)) {
            console.error(friendlyPortMessage(port));
        } else {
            console.error(`[fimake] Server failed to listen on ${port}:`, err);
        }
        process.exit(1);
    });
    // Tools edit the open Figma file, so never serve the LAN — unless the
    // user opted into networked use by setting CORS_ORIGIN (docs: security).
    // Filter per connection instead of binding one host: Figma resolves
    // `localhost` to ::1, other clients to 127.0.0.1 — both must work.
    // ponytail: port still shows as open on the LAN (connections are dropped
    // immediately); bind two loopback listeners if that ever matters.
    if (config.CORS_ORIGIN === "*") {
        httpServer.on("connection", (socket) => {
            if (!isLoopback(socket.remoteAddress)) socket.destroy();
        });
    }
    httpServer.listen(port, () => {
        infoLog(`${label} listening on http://localhost:${port}`);
    });
}
