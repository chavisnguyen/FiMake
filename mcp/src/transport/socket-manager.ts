import type { FromPluginMessage } from "@shared/types";
import { FromPluginMessageSchema } from "../shared/types/transport/from-plugin";
import { SOCKET_EVENTS, isPluginClientInfo, isTaskTarget, matchesTarget, type PluginClientInfo, type TaskTarget } from "../shared/types/transport/socket-protocol";
import type { Server, Socket } from "socket.io";
import { debugLog, infoLog } from "../shared/log";

type SocketMessage = "start-task" | "task-finished" | "task-failed";

/** One connected plugin window (one open Figma file = one socket). */
export interface PluginClient {
  socketId?: string;
  fileName?: string;
  fileKey?: string;
  connectedAt: number;
}

interface QueuedMessage {
    message: SocketMessage;
    data: unknown;
    taskId?: string;
    createdAt: number;
    retries: number;
}

/** Extract the task id from an outgoing `start-task` payload, if present. */
function taskIdOf(data: unknown): string | undefined {
    if (typeof data !== "object" || data === null || !("id" in data)) {
        return undefined;
    }
    return typeof data.id === "string" ? data.id : undefined;
}

/** File identity the UI may already know at handshake time (optional). */
function readAuthInfo(socket: Socket): PluginClientInfo {
    try {
        const auth = (socket as unknown as { handshake?: { auth?: unknown } }).handshake?.auth;
        if (isPluginClientInfo(auth)) return pickClientInfo(auth);
    } catch {
        // ignore — hello event below is the main path
    }
    return {};
}

function pickClientInfo(info: PluginClientInfo): PluginClientInfo {
    const out: PluginClientInfo = {};
    if (typeof info.fileName === "string") out.fileName = info.fileName.slice(0, 200);
    if (typeof info.fileKey === "string") out.fileKey = info.fileKey.slice(0, 200);
    return out;
}

/** Routing target carried by a `start-task` envelope, if any. */
function targetOf(data: unknown): TaskTarget | undefined {
    if (typeof data !== "object" || data === null || !("target" in data)) {
        return undefined;
    }
    const target = (data as { target?: unknown }).target;
    return isTaskTarget(target) ? target : undefined;
}

/** Human summary for logs: fileKey preferred, else fileName. */
function describeTarget(target: TaskTarget): string {
    if (typeof target.fileKey === "string" && target.fileKey.length > 0) {
        return `fileKey ${target.fileKey}`;
    }
    return `fileName ${target.fileName ?? "(unknown)"}`;
}

// Socket manager is the abstraction layer on top of the socket.io library.
// It receives messages from the Figma plugin and raises events for the
// orchestrator to handle. It also sends messages to the Figma plugin.
//
// Delivery is acknowledged, not fire-and-forget: every outgoing message is
// sent with a socket.io ack, and start-task messages that fail to deliver
// -- either because no plugin is connected, or the plugin didn't ack in
// time -- are queued and retried automatically the next time a plugin
// connects. This is what prevents a task from silently vanishing during a
// brief disconnect/reconnect (e.g. the plugin panel losing focus).
//
// Queued entries carry createdAt/retries so stale tasks can't accumulate
// forever: pruneExpired() drops entries older than pendingTtlMs or retried
// more than maxRetries.
export class SocketManager {
    constructor(server: Server, ackTimeoutMs: number = 5000, pendingTtlMs: number = 300000, maxRetries: number = 5) {
        this.server = server;
        this.ackTimeoutMs = ackTimeoutMs;
        this.pendingTtlMs = pendingTtlMs;
        this.maxRetries = maxRetries;

        this.server.on('connection', (socket) => {
            this.sockets.add(socket);
            this.activeSocket = socket;
            // Register the window immediately (even before it announces its
            // file name) so getClients() reflects connection count. Auth may
            // already carry file info when the UI knew it at connect time.
            this.clients.set(socket, {
                ...readAuthInfo(socket),
                connectedAt: Date.now(),
            });
            this.pruneExpired();
            if (this.pending.size > 0) {
                infoLog(`Plugin connected; flushing ${this.pending.size} queued message(s).`);
            }
            this.flushPending();

            socket.on('disconnect', () => {
                this.sockets.delete(socket);
                this.clients.delete(socket);
                if (this.activeSocket === socket) {
                    // Fall back to another connected plugin if one exists.
                    const next = this.sockets.values().next();
                    this.activeSocket = next.done ? null : (next.value as Socket);
                }
            });

            // A plugin window announces "tao là file X" after the main
            // thread posts FILE_INFO to the UI. Updates the entry created
            // above — never creates duplicates on re-announce. Then retries
            // pending tasks: a task targeted at this file may have been
            // waiting for it to appear.
            socket.on(SOCKET_EVENTS.CLIENT_HELLO, (data: unknown) => {
                if (!isPluginClientInfo(data)) {
                    console.error('Ignoring malformed client-hello payload:', data);
                    return;
                }
                const prev = this.clients.get(socket) ?? { connectedAt: Date.now() };
                this.clients.set(socket, { ...prev, ...pickClientInfo(data) });
                debugLog(`Plugin hello: ${data.fileName ?? "(unnamed)"} ${data.fileKey ?? ""}`.trim());
                if (this.pending.size > 0) this.flushPending();
            });

            socket.on('task-finished', (data: unknown) => {
                const parsed = FromPluginMessageSchema.safeParse(data);
                if (!parsed.success) {
                    console.error('Ignoring malformed task-finished payload:', data);
                    return;
                }
                // The task settled, so stop treating it as retryable even if an
                // earlier start-task ack for it never arrived.
                this.pending.delete(parsed.data.taskId);
                try {
                    if (this._onTaskFinishedCallback) {
                        this._onTaskFinishedCallback(parsed.data);
                    }
                } catch (error) {
                    console.error('Error in task-finished handler:', error);
                }
            });

            socket.on('task-failed', (data: unknown) => {
                const parsed = FromPluginMessageSchema.safeParse(data);
                if (!parsed.success) {
                    console.error('Ignoring malformed task-failed payload:', data);
                    return;
                }
                this.pending.delete(parsed.data.taskId);
                try {
                    if (this._onTaskErrorCallback) {
                        this._onTaskErrorCallback(parsed.data);
                    }
                } catch (error) {
                    console.error('Error in task-failed handler:', error);
                }
            });
        });
    }

    public sendMessage(message: SocketMessage, data: unknown) {
        if (message === 'start-task') {
            const taskId = taskIdOf(data);
            if (taskId !== undefined) {
                const prev = this.pending.get(taskId);
                this.pending.set(taskId, {
                    message,
                    data,
                    taskId,
                    createdAt: prev?.createdAt ?? Date.now(),
                    retries: prev?.retries ?? 0,
                });
            }
        }
        this.deliver(message, data);
    }

    private deliver(message: SocketMessage, data: unknown) {
        // Default: broadcast to all connected plugin sockets (if multiple
        // Figma windows open) — prevents race where second window never
        // receives tasks. Ack from any socket clears the pending queue.
        // Targeted tasks (targetFileKey/targetFileName) go only to matching
        // windows; with no match yet the entry stays queued so it fires
        // when the right file connects (or times out via TaskManager).
        let targets = [...this.sockets];
        const target = message === 'start-task' ? targetOf(data) : undefined;
        if (target !== undefined) {
            targets = targets.filter((sock) => {
                const info = this.clients.get(sock);
                return info !== undefined && matchesTarget(info, target);
            });
            if (targets.length === 0) {
                const known = [...this.clients.values()]
                    .map((c) => c.fileName ?? "(unnamed)")
                    .join(", ") || "(no windows connected)";
                console.warn(`[fimake] No plugin matches target ${describeTarget(target)} (connected: ${known}); keeping task ${taskIdOf(data) ?? "unknown"} queued.`);
                return;
            }
        }
        if (targets.length === 0) {
            if (message === 'start-task') {
                console.warn(`[fimake] No plugin connected; queuing "${message}" (task ${taskIdOf(data) ?? "unknown"}) for the next connection.`);
            }
            return;
        }
        const taskId = message === 'start-task' ? taskIdOf(data) : undefined;
        let acked = false;
        for (const sock of targets) {
            sock.timeout(this.ackTimeoutMs).emit(message, data, (err: unknown) => {
                if (err) {
                    if (!acked) {
                        console.error(`Plugin did not acknowledge "${message}" within ${this.ackTimeoutMs}ms; it will be retried on the next connection if still pending.`);
                    }
                    return;
                }
                if (acked) return;
                acked = true;
                if (message === 'start-task' && taskId !== undefined) {
                    debugLog(`Plugin acknowledged "${message}" (task ${taskId}).`);
                    this.pending.delete(taskId);
                }
            });
        }
    }

    private flushPending() {
        this.pruneExpired();
        for (const entry of this.pending.values()) {
            if (entry.retries >= this.maxRetries) {
                console.error(`Dropping "${entry.message}" (task ${entry.taskId ?? "unknown"}) after ${entry.retries} retries.`);
                if (entry.taskId !== undefined) this.pending.delete(entry.taskId);
                continue;
            }
            entry.retries += 1;
            this.deliver(entry.message, entry.data);
        }
    }

    /** Drop queued entries older than TTL; returns number dropped. */
    public pruneExpired(now: number = Date.now()): number {
        let dropped = 0;
        for (const [id, entry] of this.pending) {
            if (now - entry.createdAt > this.pendingTtlMs) {
                this.pending.delete(id);
                dropped += 1;
            }
        }
        if (dropped > 0) infoLog(`Pruned ${dropped} expired queued message(s).`);
        return dropped;
    }

    public getPendingCount(): number {
        return this.pending.size;
    }

    /** Snapshot of connected plugin windows (one per open Figma file). */
    public getClients(): PluginClient[] {
        return [...this.clients.entries()].map(([socket, info]) => {
            const socketId = (socket as unknown as { id?: unknown }).id;
            return {
                ...(typeof socketId === "string" ? { socketId } : {}),
                ...(info.fileName !== undefined ? { fileName: info.fileName } : {}),
                ...(info.fileKey !== undefined ? { fileKey: info.fileKey } : {}),
                connectedAt: info.connectedAt,
            };
        });
    }

    public getClientCount(): number {
        return this.clients.size;
    }

    public isPluginConnected(): boolean {
        return this.clients.size > 0;
    }

    private server: Server;
    private activeSocket: Socket | null = null;
    private sockets = new Set<Socket>();
    private clients = new Map<Socket, PluginClientInfo & { connectedAt: number }>();
    private ackTimeoutMs: number;
    private pendingTtlMs: number;
    private maxRetries: number;
    private pending: Map<string, QueuedMessage> = new Map();

    // Events

    private _onTaskFinishedCallback?: (task: FromPluginMessage) => void;

    public onTaskFinished(callback: (task: FromPluginMessage) => void) {
        this._onTaskFinishedCallback = callback;
    }

    private _onTaskErrorCallback?: (task: FromPluginMessage) => void;
    public onTaskError(callback: (task: FromPluginMessage) => void) {
        this._onTaskErrorCallback = callback;
    }

}
