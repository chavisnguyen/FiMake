import type { FromPluginMessage } from "@shared/types";
import { FromPluginMessageSchema } from "../shared/types/transport/from-plugin";
import type { Server, Socket } from "socket.io";
import { debugLog, infoLog } from "../shared/log";

type SocketMessage = "start-task" | "task-finished" | "task-failed";

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
            this.pruneExpired();
            if (this.pending.size > 0) {
                infoLog(`Plugin connected; flushing ${this.pending.size} queued message(s).`);
            }
            this.flushPending();

            socket.on('disconnect', () => {
                this.sockets.delete(socket);
                if (this.activeSocket === socket) {
                    // Fall back to another connected plugin if one exists.
                    const next = this.sockets.values().next();
                    this.activeSocket = next.done ? null : (next.value as Socket);
                }
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
        if (!this.activeSocket) {
            if (message === 'start-task') {
                console.warn(`[fimake] No plugin connected; queuing "${message}" (task ${taskIdOf(data) ?? "unknown"}) for the next connection.`);
            }
            return;
        }
        const taskId = message === 'start-task' ? taskIdOf(data) : undefined;
        this.activeSocket.timeout(this.ackTimeoutMs).emit(message, data, (err: unknown) => {
            if (err) {
                console.error(`Plugin did not acknowledge "${message}" within ${this.ackTimeoutMs}ms; it will be retried on the next connection if still pending.`);
                return;
            }
            if (message === 'start-task' && taskId !== undefined) {
                debugLog(`Plugin acknowledged "${message}" (task ${taskId}).`);
                this.pending.delete(taskId);
            }
        });
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

    private server: Server;
    private activeSocket: Socket | null = null;
    private sockets = new Set<Socket>();
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
