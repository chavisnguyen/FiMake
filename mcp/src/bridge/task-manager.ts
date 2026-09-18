import { generateUUID } from "../utils";

type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "timed_out";

export interface TaskResult {
    isError: boolean;
    content?: unknown;
}

interface Task {
    id: string;
    command: string;
    args: unknown;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    resolve: (result: TaskResult) => void;
    reject: (result: TaskResult) => void;
    result: unknown;
    timer?: ReturnType<typeof setTimeout>;
}

// Task manager is responsible for managing the tasks.
// Task could be added, updated and removed.
// Events are raised when a task is added or updated.
//
// Settling semantics (kept for MCP compat): completed resolves
// {isError:false}, failed/timed_out resolve {isError:true} — never reject —
// so tool callers always get a CallToolResult instead of a thrown promise.
// Entries are removed from the map on settle to avoid unbounded growth.
export class TaskManager {
    private tasks = new Map<string, Task>();
    private timeoutMs: number;

    constructor(timeoutMs: number = 20000) {
        this.timeoutMs = timeoutMs;
    }

    public runTask<TResult, TArgs>(
        command: string,
        args: TArgs): Promise<TResult> {
        const id = generateUUID();
        const promise = new Promise((resolve, reject) => {
            this.addTask(id, command, args, resolve, reject);
            const task = this.tasks.get(id);
            if (task) {
                if (task.timer !== undefined) clearTimeout(task.timer);
                // NOTE: intentionally NOT unref'd — the timeout is the only
                // thing keeping a short-lived caller alive until settle.
                task.timer = setTimeout(() => {
                    console.warn(`[fimake] task timed out ${id} ${command} after ${this.timeoutMs}ms (plugin silent?)`);
                    this.updateTask(id, { error: "Task timed out" }, "timed_out");
                }, this.timeoutMs);
            }
        });
        return promise as Promise<TResult>;
    }

    public addTask<TArgs>(id: string,
        command: string,
        args: TArgs,
        resolve: (result: TaskResult) => void,
        reject: (result: TaskResult) => void) {
        // Duplicate ids must not accumulate: drop the stale entry first.
        const existing = this.tasks.get(id);
        if (existing) {
            if (existing.timer !== undefined) clearTimeout(existing.timer);
            this.tasks.delete(id);
        }
        const task: Task = {
            id: id,
            command: command,
            args: args,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            resolve: resolve,
            reject: reject,
            result: null,
        };
        this.tasks.set(id, task);
        // Call the onTaskAdded event if subscriber(s) exist
        if (typeof this._onTaskAddedCallback === "function") {
            this._onTaskAddedCallback(task);
        }
    }

    private _onTaskAddedCallback?: (task: Task) => void;

    // Register a callback for when a task is added
    public onTaskAdded(callback: (task: Task) => void) {
        this._onTaskAddedCallback = callback;
    }

    /** Number of unsettled tasks (for tests / monitoring). */
    public getPendingCount(): number {
        return this.tasks.size;
    }

    /** Ids of unsettled tasks (for tests / monitoring). */
    public getPendingTaskIds(): string[] {
        return [...this.tasks.keys()];
    }

    public updateTask(id: string, result: unknown, status: TaskStatus) {

        const task = this.tasks.get(id);
        if (task) {
            if (task.status === 'completed'
                || task.status === 'failed'
                || task.status === 'timed_out') {
                if (task.status !== 'completed') {
                    console.error("Attempt to update task after it has been completed, failed or timed out", id, result, status);
                }
                return;
            }

            task.status = status;
            task.updatedAt = new Date();
            if (task.timer !== undefined) clearTimeout(task.timer);
            // Remove BEFORE resolving so re-entrant updateTask calls from
            // resolvers see the settled state instead of double-resolving.
            this.tasks.delete(id);
        }
        else {
            console.error("Attempt to update task that does not exist", id, result, status);
            return;
        }

        if (status === 'completed') {
            task?.resolve({
                isError: false,
                content: result,
            });
        } else if (status === 'failed'
            || status === 'timed_out'
        ) {
            task?.resolve({
                isError: true,
                content: result,
            });
        }
    }
}
