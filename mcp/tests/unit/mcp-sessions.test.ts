import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpSessionStore, parseBodyLimit } from "../../src/transport/mcp-sessions";
import { createBridge } from "../../src/bridge/server";
import type { Server } from "socket.io";
import { cast } from "../helpers";

function fakeReq(opts: { method?: string; url?: string; headers?: Record<string, string>; body?: string }): IncomingMessage {
    const req = new EventEmitter() as unknown as IncomingMessage & { resume: () => void };
    req.method = opts.method ?? "POST";
    req.url = opts.url ?? "/mcp";
    req.headers = opts.headers ?? {};
    req.resume = vi.fn();
    process.nextTick(() => {
        if (opts.body !== undefined) req.emit("data", Buffer.from(opts.body));
        req.emit("end");
    });
    return req as IncomingMessage;
}

interface FakeRes {
    status?: number;
    body: string;
    done: Promise<void>;
}

function fakeRes(): { res: FakeRes; nodeRes: ServerResponse } {
    let resolve!: () => void;
    const done = new Promise<void>((r) => {
        resolve = r;
    });
    const state: FakeRes = { body: "", done };
    const nodeRes = {
        writeHead: (status: number) => {
            state.status = status;
        },
        end: (chunk?: unknown) => {
            if (typeof chunk === "string") state.body += chunk;
            resolve();
        },
        on: () => {},
        get headersSent() {
            return state.status !== undefined || state.body.length > 0;
        },
    } as unknown as ServerResponse;
    return { res: state, nodeRes };
}

function bridge(): ReturnType<typeof createBridge> {
    const fakeIo = { on: vi.fn() };
    return createBridge(fakeIo as unknown as Server);
}

describe("parseBodyLimit", () => {
    it("parses kb/mb/gb + bare bytes, falls back to 1mb", () => {
        expect(parseBodyLimit("1mb")).toBe(1024 * 1024);
        expect(parseBodyLimit("512kb")).toBe(512 * 1024);
        expect(parseBodyLimit("2gb")).toBe(2 * 1024 ** 3);
        expect(parseBodyLimit("100")).toBe(100);
        expect(parseBodyLimit("junk")).toBe(1024 * 1024);
    });
});

describe("McpSessionStore (no HTTP framework)", () => {
    it("rejects POST without session as bad request", async () => {
        const store = new McpSessionStore(bridge());
        try {
            const { res, nodeRes } = fakeRes();
            await store.handle(
                fakeReq({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }),
                nodeRes,
            );
            await res.done;
            expect(res.status).toBe(400);
            expect(res.body).toContain("No valid session ID");
        } finally {
            store.stop();
        }
    });

    it("rejects oversized bodies with 413", async () => {
        const store = new McpSessionStore(bridge(), { bodyLimit: 10 });
        try {
            const { res, nodeRes } = fakeRes();
            await store.handle(
                fakeReq({
                    headers: { "content-length": "9999" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
                }),
                nodeRes,
            );
            await res.done;
            expect(res.status).toBe(413);
        } finally {
            store.stop();
        }
    });

    it("rejects GET/DELETE with unknown session", async () => {
        const store = new McpSessionStore(bridge());
        try {
            for (const method of ["GET", "DELETE"]) {
                const { res, nodeRes } = fakeRes();
                await store.handle(
                    fakeReq({ method, headers: { "mcp-session-id": "nope" } }),
                    nodeRes,
                );
                await res.done;
                expect(res.status).toBe(400);
            }
        } finally {
            store.stop();
        }
    });

    it("rejects unknown methods with 405", async () => {
        const store = new McpSessionStore(bridge());
        try {
            const { res, nodeRes } = fakeRes();
            await store.handle(fakeReq({ method: "PUT", body: "{}" }), nodeRes);
            await res.done;
            expect(res.status).toBe(405);
        } finally {
            store.stop();
        }
    });

    it("prune drops idle sessions", async () => {
        const store = new McpSessionStore(bridge(), { idleMs: 100, sweepMs: 60 * 1000 });
        try {
            cast<{ lastSeen: Map<string, number> }>(store as unknown).lastSeen.set("old", Date.now() - 1000);
            expect(store.prune()).toBe(1);
            expect(store.size).toBe(0);
        } finally {
            store.stop();
        }
    });
});
