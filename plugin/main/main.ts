import { StartTaskHandler, TaskFinishedHandler, TaskFailedHandler, UiResizeRequest } from './types';
import { emit, on } from '@create-figma-plugin/utilities';
import { dispatchTask } from './tools/dispatch';
import { pluginDebug, pluginLog } from './debug';

const PILL_WIDTH = 300;
const PILL_HEIGHT = 78;
const CONSOLE_WIDTH = 600;
const CONSOLE_HEIGHT = 640;

/**
 * Commands that fan out across pages need the whole file loaded.
 * Single-node tools (get-node-info, export-asset) use getNodeByIdAsync,
 * which loads the containing page on demand — no need to preload all.
 */
const NEEDS_ALL_PAGES = new Set([
  "get-pages",
  "get-all-components",
]);

function isResizeRequest(msg: unknown): msg is UiResizeRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg.type === "expand" || msg.type === "collapse")
  );
}

async function handleStartTask(task: StartTaskHandler): Promise<void> {
  try {
    if (!task || typeof task.taskId !== "string" || typeof task.command !== "string") {
      console.error('Ignoring malformed START_TASK payload:', task);
      return;
    }
    if (NEEDS_ALL_PAGES.has(task.command)) {
      await figma.loadAllPagesAsync();
    }
    pluginLog(`START_TASK ${task.taskId} ${task.command}`);
    pluginDebug('args', task.args);

    const result = await dispatchTask(task.command, task.args);
    pluginDebug(`result ${task.taskId}`, result);

    if (result.isError) {
      emit<TaskFailedHandler>('TASK_FAILED', {
        name: 'TASK_FAILED',
        taskId: task.taskId,
        content: result.content,
        isError: result.isError
      })
    }
    else {
      emit<TaskFinishedHandler>('TASK_FINISHED', {
        name: 'TASK_FINISHED',
        taskId: task.taskId,
        content: result.content,
        isError: result.isError
      })
    }
  }
  catch (error) {
    console.error(error);
    emit<TaskFailedHandler>('TASK_FAILED', {
      name: 'TASK_FAILED',
      taskId: task.taskId,
      content: error instanceof Error ? error.message : JSON.stringify(error),
      isError: true
    })
  }
}

function main() {

  on<StartTaskHandler>('START_TASK', handleStartTask);

  // figma.ui.onmessage is a SINGLE slot. `on()` above assigns it, so we
  // wrap it once to also handle resize requests — without wrapping, a later
  // `figma.ui.onmessage = ...` would silently drop START_TASK and every
  // tool call would time out. We capture the handler set by `on()` and
  // dispatch explicitly.
  const prevOnMessage = figma.ui.onmessage as ((msg: unknown) => void) | undefined;
  figma.ui.onmessage = (msg: unknown) => {
    if (isResizeRequest(msg)) {
      figma.ui.resize(msg.type === "expand" ? CONSOLE_WIDTH : PILL_WIDTH, msg.type === "expand" ? CONSOLE_HEIGHT : PILL_HEIGHT);
      return;
    }
    // Delegate START_TASK (and any future plugin messages) to the utilities handler
    if (typeof prevOnMessage === "function") {
      prevOnMessage(msg);
      return;
    }
    // Fallback if `on()` didn't set a handler (defensive)
    const rec = msg as Record<string, unknown>;
    if (rec && rec.name === "START_TASK") {
      void handleStartTask(msg as unknown as StartTaskHandler);
    }
  };

  figma.showUI(__html__, { width: PILL_WIDTH, height: PILL_HEIGHT });
}

main();
