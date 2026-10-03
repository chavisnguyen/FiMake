import type { SocketManager } from "../transport/socket-manager";
import type { TaskManager } from "./task-manager";
import { splitTarget } from "../shared/types/transport/socket-protocol";
import { debugLog, infoLog } from "../shared/log";

export class Orchestrator {

    private socketManager: SocketManager;
    private taskManager: TaskManager;

    constructor(socketManager: SocketManager, taskManager: TaskManager) {
        this.socketManager = socketManager;
        this.taskManager = taskManager;

        // Subscribe to task added events
        // Send start-task message via web socket to the Figma plugin.
        // NOTE: only the plain {id, command, args} envelope goes over the
        // wire. The internal Task also carries resolve/reject functions and
        // a timer handle (circular) — serializing it crashes socket.io's
        // binary detection on retry/flush paths. taskIdOf() still reads `.id`.
        this.taskManager.onTaskAdded((task) => {
            infoLog(`task added ${task.id} ${task.command}`);
            debugLog(`task args ${task.id}`, task.args);
            // Pull routing fields out of args: the plugin's zod schemas
            // don't declare them, so they travel in the envelope instead.
            const { cleanArgs, target } = splitTarget(task.args);
            try {
                this.socketManager.sendMessage('start-task', target === undefined
                    ? {
                        id: task.id,
                        command: task.command,
                        args: cleanArgs,
                    }
                    : {
                        id: task.id,
                        command: task.command,
                        args: cleanArgs,
                        target,
                    });
            } catch (error) {
                // Never leave a task stuck in pending until the timeout:
                // a send failure settles it now with the reason attached.
                console.error(`Failed to send start-task ${task.id}:`, error);
                this.taskManager.updateTask(task.id, error instanceof Error ? error.message : String(error), 'failed');
            }
        });


        // Subscribe to task finished events
        // Raise task completed event in the task manager on me
        this.socketManager.onTaskFinished((task) => {
            infoLog(`task completed ${task.taskId}`);
            debugLog(`task content ${task.taskId}`, task.content);
            this.taskManager.updateTask(task.taskId, task.content, 'completed');
        });

        // Subscribe to task failed events
        // Raise task failed event in the task manager on message received
        this.socketManager.onTaskError((task) => {
            infoLog(`task failed ${task.taskId}`);
            debugLog(`task content ${task.taskId}`, task.content);
            this.taskManager.updateTask(task.taskId, task.content, 'failed');
        });
    }

}