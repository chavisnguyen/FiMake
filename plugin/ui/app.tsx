import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { on } from "@create-figma-plugin/utilities";
import type { FileInfoHandler, UiResizeRequest } from "../main/types";
import { connectTaskSocket, type SettleStatus, type TaskSocketHandle } from "./adapters/taskSocket";
import {
  MAX_TASKS,
  appendTask,
  clearFinished,
  createTask,
  filterTasks,
  isFileInfo,
  projectLabel,
  resolveSocketUrl,
  settleTask,
  statusLabel,
  type FileInfo,
  type Task,
  type TaskFilter,
} from "./domain/tasks";

function requestResize(type: UiResizeRequest["type"]): void {
  // ponytail: "*" is fine — Figma plugin iframes have no web origin to lock to.
  // Revisit only if this UI ever runs outside figma.showUI.
  parent.postMessage({ pluginMessage: { type } satisfies UiResizeRequest }, "*");
}

function LogoSvg({ size }: { size: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      style={{ display: "block" }}
    >
      <path
        d="M48 34v60M48 44h42M48 70h30"
        stroke="#fff"
        strokeWidth={17}
        strokeLinecap="round"
      />
    </svg>
  );
}

function TaskRow({ task }: { task: Task }): JSX.Element {
  return (
    <div className="task" data-status={task.status} data-task-id={task.id} title={task.note}>
      <span className="task-icon" />
      <div className="task-body">
        <span className="task-cmd">{task.command}</span>
        {task.summary && (
          <span className="task-sub" title={task.title}>
            {task.summary}
          </span>
        )}
      </div>
      <span className="task-meta">
        {task.time}
        {task.duration}
      </span>
    </div>
  );
}

const FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

export function App(): JSX.Element {
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<"dot" | "console">("dot");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [serverUrl] = useState(resolveSocketUrl);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<TaskSocketHandle | null>(null);

  useEffect(() => {
    document.body.dataset.status = connected ? "online" : "offline";
  }, [connected]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [tasks, view]);

  useEffect(() => {
    const handle = connectTaskSocket(serverUrl, {
      onStatus: setConnected,
      onStartTask: (task) => {
        setTasks((prev) => appendTask(prev, createTask(task), MAX_TASKS).tasks);
      },
      onSettle: (taskId: string, status: SettleStatus, note?: string) => {
        setTasks((prev) => settleTask(prev, taskId, status, note));
      },
    });
    socketRef.current = handle;
    return () => {
      socketRef.current = null;
      handle.disconnect();
    };
  }, [serverUrl]);

  // Main thread posts FILE_INFO once on startup ("tao là file X").
  // Show it in the pill + forward it to the server as client-hello so
  // /health can tell multiple open files apart.
  useEffect(() => {
    const off = on<FileInfoHandler>("FILE_INFO", (msg) => {
      if (!isFileInfo(msg)) return;
      const info: FileInfo =
        typeof msg.fileKey === "string" && msg.fileKey.length > 0
          ? { fileName: msg.fileName, fileKey: msg.fileKey }
          : { fileName: msg.fileName };
      setFileInfo(info);
      socketRef.current?.announceFile(info);
    });
    return () => {
      try {
        (off as unknown as () => void)();
      } catch {
        // ignore — older utilities return void
      }
    };
  }, []);

  function showConsole(): void {
    setView("console");
    requestResize("expand");
  }

  function showDot(): void {
    setView("dot");
    requestResize("collapse");
  }

  function clearFinishedTasks(): void {
    setTasks((prev) => clearFinished(prev));
  }

  // settleTask stamps duration from the task's startedAt.
  const visibleTasks = filterTasks(tasks, filter);
  const label = statusLabel(connected);
  const project = projectLabel(fileInfo);

  return (
    <>
      <div id="dot-view" hidden={view !== "dot"}>
        <button id="dot" aria-label={`Fimake status — ${label}${project ? ` — ${project}` : ""}`} onClick={showConsole}>
          <span id="dot-logo" aria-hidden="true">
            <LogoSvg size={20} />
          </span>
          <span id="dot-body">
            <span id="dot-title">Fimake</span>
            {project ? <span id="dot-project">{project}</span> : null}
            <span id="dot-status">
              <span id="dot-status-dot" />
              <span id="dot-status-label">{label}</span>
            </span>
          </span>
          <span id="dot-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      <div id="console-view" hidden={view !== "console"}>
        <section id="banner">
          <span id="brand-mark" aria-hidden="true">
            <LogoSvg size={24} />
          </span>
          <div id="brand-text">
            <div id="brand-title">Fimake</div>
            <div id="status-text">{connected ? "Connected to MCP server" : "Not connected to MCP server"}</div>
            {project ? <div id="project-text">{project}</div> : null}
          </div>
          <button id="collapse" aria-label="Collapse to status pill" onClick={showDot}>
            –
          </button>
        </section>
        <div id="toolbar">
          <div id="filter" role="group" aria-label="Filter tasks by status">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`filter-btn${filter === f.value ? " active" : ""}`}
                data-filter={f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span id="task-count">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </span>
          <button id="clear" onClick={clearFinishedTasks}>
            Clear
          </button>
        </div>
        <div id="feed" data-filter={filter} aria-live="polite" ref={feedRef}>
          {visibleTasks.length === 0 ? (
            <div id="empty">
              <strong>No tasks yet</strong>
              Ask your AI client to do something in Figma and watch it happen here.
            </div>
          ) : (
            visibleTasks.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
        <details id="help">
          <summary>Setup help</summary>
          <p>1. Open MCP configuration of your client</p>
          <p>
            2. Use Streaming HTTP transport with your server URL (default{" "}
            <code>http://localhost:10101/mcp</code>)
          </p>
          <p>3. Save changes and restart your client if needed</p>
          <a href="https://github.com/chavisnguyen/fimake" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </details>
        <footer id="console-footer">
          <span id="server-url">{serverUrl}</span>
          <a href="https://github.com/chavisnguyen/fimake" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </footer>
      </div>
    </>
  );
}
