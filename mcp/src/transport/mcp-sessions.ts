import { generateUUID } from "../utils";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { createMcpServer, type FigmaBridge } from "../bridge/server";
import { config } from "../config/config";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Parse "1mb"/"512kb"/"2gb" (or plain bytes) to a byte count. */
export function parseBodyLimit(limit: string): number {
    const m = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?b?)?\s*$/i.exec(limit);
    if (!m) return 1024 * 1024;
    const n = parseFloat(m[1]!);
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("g")) return Math.floor(n * 1024 ** 3);
    if (unit.startsWith("m")) return Math.floor(n * 1024 ** 2);
    if (unit.startsWith("k")) return Math.floor(n * 1024);
    return Math.floor(n);
}

function readRawBody(req: IncomingMessage, limit: number): Promise<{ ok: true; text: string } | { ok: false; status: number }> {
    return new Promise((resolve) => {
        const len = Number(req.headers["content-length"] ?? 0);
        if (len > limit) {
            // Destroy if available (real IncomingMessage), else resume for test fakes
            if (typeof (req as unknown as { destroy?: () => void }).destroy === "function") {
                (req as unknown as { destroy: () => void }).destroy();
            } else {
                req.resume();
            }
            resolve({ ok: false, status: 413 });
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const settle = (result: { ok: true; text: string } | { ok: false; status: number }) => {
            if (settled) return;
            settled = true;
            // Cleanup listeners to avoid leaks
            req.removeAllListeners("data");
            req.removeAllListeners("end");
            req.removeAllListeners("error");
            resolve(result);
        };
        req.on("data", (c: Buffer) => {
            if (settled) return;
            chunks.push(c);
            size += c.length;
            if (size > limit) {
                if (typeof (req as unknown as { destroy?: () => void }).destroy === "function") {
                    (req as unknown as { destroy: () => void }).destroy();
                } else {
                    req.resume();
                }
                settle({ ok: false, status: 413 });
            }
        });
        req.on("end", () => settle({ ok: true, text: Buffer.concat(chunks).toString("utf-8") }));
        req.on("error", () => settle({ ok: false, status: 400 }));
        req.on("close", () => {
            if (!settled) settle({ ok: false, status: 400 });
        });
    });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown, sessionId?: string): void {
    res.writeHead(status, {
        "Content-Type": "application/json",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    });
    res.end(JSON.stringify(body));
}

/**
 * Framework-free MCP session store + request handler.
 * Works on raw Node req/res — no Hono/Express knowledge — so it can be
 * unit-tested with fake sockets and survives framework upgrades.
 */
export class McpSessionStore {
    private transports = new Map<string, StreamableHTTPServerTransport>();
    private lastSeen = new Map<string, number>();
    private readonly idleMs: number;
    private readonly bodyLimit: number;
    private readonly sweep: ReturnType<typeof setInterval>;

    constructor(
        private readonly bridge: FigmaBridge,
        opts?: { idleMs?: number; bodyLimit?: number; sweepMs?: number },
    ) {
        this.idleMs = opts?.idleMs ?? 30 * 60 * 1000;
        this.bodyLimit = opts?.bodyLimit ?? parseBodyLimit(config.JSON_BODY_LIMIT);
        // ponytail: idle sessions never send DELETE, so entries would leak.
        // Sweep periodically; upgrade to explicit heartbeat when multi-user.
        this.sweep = setInterval(() => this.prune(), opts?.sweepMs ?? 60 * 1000);
    }

    /** Active session count (tests / monitoring). */
    get size(): number {
        return this.transports.size;
    }

    stop(): void {
        clearInterval(this.sweep);
    }

    /** Drop sessions idle past the budget; returns count dropped. */
    prune(now: number = Date.now()): number {
        let dropped = 0;
        for (const [sid, seen] of this.lastSeen) {
            if (now - seen > this.idleMs) {
                const stale = this.transports.get(sid);
                this.transports.delete(sid);
                this.lastSeen.delete(sid);
                dropped += 1;
                // Fire-and-forget: free server state; a stale client gets
                // 400 on next use and re-initializes cleanly.
                stale?.close().catch((err) => console.error("Error closing idle session:", err));
            }
        }
        return dropped;
    }

    private touch(sid: string): void {
        this.lastSeen.set(sid, Date.now());
    }

    private forget(transport: StreamableHTTPServerTransport): void {
        if (transport.sessionId) {
            this.transports.delete(transport.sessionId);
            this.lastSeen.delete(transport.sessionId);
        }
    }

    async handle(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {
        const method = (req.method ?? "GET").toUpperCase();
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const existing = sessionId ? this.transports.get(sessionId) : undefined;

        if (method === "POST") {
            if (existing && sessionId) {
                this.touch(sessionId);
                try {
                    const parsed = body === undefined ? await this.readJson(req) : { ok: true as const, body };
                    if (!parsed.ok) {
                        jsonResponse(res, parsed.status, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
                        return;
                    }
                    await existing.handleRequest(req, res, parsed.body);
                } catch (error) {
                    console.error("Error handling MCP POST request:", error);
                    if (!res.headersSent) {
                        jsonResponse(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
                    }
                }
                return;
            }

            const parsed = body === undefined ? await this.readJson(req) : { ok: true as const, body };
            if (!parsed.ok) {
                jsonResponse(res, parsed.status, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
                return;
            }
            if (sessionId || !isInitializeRequest(parsed.body)) {
                jsonResponse(res, 400, {
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Bad Request: No valid session ID provided" },
                    id: null,
                });
                return;
            }
            // New initialization request — fresh protocol server per session.
            const mcpServer = createMcpServer(this.bridge.taskManager);
            let transport!: StreamableHTTPServerTransport;
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => generateUUID(),
                onsessioninitialized: (sid) => {
                    this.transports.set(sid, transport);
                    this.touch(sid);
                },
            });
            transport.onclose = () => this.forget(transport);
            await mcpServer.connect(transport);
            try {
                await transport.handleRequest(req, res, parsed.body);
            } catch (error) {
                console.error("Error handling MCP POST request:", error);
                if (!res.headersSent) {
                    jsonResponse(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
                }
            }
            return;
        }

        if (method === "GET" || method === "DELETE") {
            const transport = existing;
            if (!sessionId || !transport) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid or missing session ID");
                return;
            }
            this.touch(sessionId);
            try {
                await transport.handleRequest(req, res);
            } catch (error) {
                console.error("Error handling session request:", error);
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal server error");
                }
            }
            return;
        }

        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method not allowed");
    }

    private async readJson(req: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
        const raw = await readRawBody(req, this.bodyLimit);
        if (!raw.ok) return raw;
        if (!raw.text) return { ok: true, body: undefined };
        try {
            return { ok: true, body: JSON.parse(raw.text) as unknown };
        } catch {
            return { ok: false, status: 400 };
        }
    }
}
