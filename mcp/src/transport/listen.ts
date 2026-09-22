import type { Server as HttpServer } from "node:http";
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
        `[fimake] Do NOT start the server by hand when your MCP client uses stdio: the client spawns its own server and the two fight over this port.\n` +
        `[fimake] Fix (pick one): stop the other server, then restart your client — or point your client at the running one via http://localhost:${port}/mcp (streamable-http).\n` +
        `[fimake] Run \`fimake doctor\` to see who holds the port.`
    );
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
    httpServer.listen(port, () => {
        infoLog(`${label} listening on http://localhost:${port}`);
    });
}
