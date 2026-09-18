// Adapter layer: bridges socket.io + Figma plugin messaging to domain events.
// Depends on infrastructure (socket.io-client, plugin utilities) but holds
// no UI state — tested with fakes, never a real server.

import { io, type Socket } from "socket.io-client";
import { emit, on } from "@create-figma-plugin/utilities";
import type {
  StartTaskHandler,
  TaskFailedHandler,
  TaskFinishedHandler,
} from "../../main/types";
import { describeContent } from "../domain/tasks";

/** Payload the MCP server sends over the socket for a `start-task` message. */
export interface StartTaskPayload {
  id: string;
  command: string;
  args: unknown;
}

export type SettleStatus = "done" | "failed";

export interface TaskSocketEvents {
  onStatus: (connected: boolean) => void;
  onStartTask: (task: StartTaskPayload) => void;
  onSettle: (taskId: string, status: SettleStatus, note?: string) => void;
}

export interface TaskSocketHandle {
  disconnect: () => void;
}

function isStartTaskPayload(value: unknown): value is StartTaskPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StartTaskPayload).id === "string" &&
    typeof (value as StartTaskPayload).command === "string"
  );
}

/**
 * Connect to the MCP bridge and forward socket/plugin events to `events`.
 * Returns a handle that unsubscribes everything (safe to call twice).
 */
export function connectTaskSocket(url: string, events: TaskSocketEvents): TaskSocketHandle {
  const socket: Socket = io(url, {
    transports: ["websocket", "polling"],
    upgrade: true,
    rememberUpgrade: false,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    events.onStatus(true);
  });
  socket.on("disconnect", () => {
    events.onStatus(false);
  });

  socket.on("start-task", (task: StartTaskPayload, ack?: (received: boolean) => void) => {
    if (!isStartTaskPayload(task)) {
      console.error("Ignoring malformed start-task payload:", task);
      ack?.(true);
      return;
    }
    emit<StartTaskHandler>("START_TASK", {
      taskId: task.id,
      command: task.command,
      args: task.args,
    });
    events.onStartTask(task);
    // Acknowledge receipt so the server knows this task doesn't need to be
    // queued for retry on the next connection.
    ack?.(true);
  });

  const offFinished = on<TaskFinishedHandler>("TASK_FINISHED", (task) => {
    socket.emit("task-finished", task);
    events.onSettle(task.taskId, "done");
  });
  const offFailed = on<TaskFailedHandler>("TASK_FAILED", (task) => {
    socket.emit("task-failed", task);
    events.onSettle(task.taskId, "failed", describeContent(task.content));
  });

  let closed = false;
  return {
    disconnect: () => {
      if (closed) return;
      closed = true;
      offFinished();
      offFailed();
      socket.disconnect();
    },
  };
}
