// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { App } from "../../ui/app";
import type { TaskSocketEvents } from "../../ui/adapters/taskSocket";

const { captured } = vi.hoisted(() => ({ captured: { events: null as TaskSocketEvents | null } }));

vi.mock("../../ui/adapters/taskSocket", () => ({
  connectTaskSocket: vi.fn((_url: string, events: TaskSocketEvents) => {
    captured.events = events;
    return { disconnect: vi.fn() };
  }),
}));

function events(): TaskSocketEvents {
  if (!captured.events) throw new Error("socket not connected");
  return captured.events;
}

beforeEach(() => {
  captured.events = null;
});

afterEach(() => {
  cleanup();
  document.body.dataset.status = "offline";
});

describe("App", () => {
  it("starts offline, then reflects connection status", () => {
    render(<App />);
    expect(screen.getByText("Not connected — click to open")).toBeDefined();
    expect(document.body.dataset.status).toBe("offline");
    act(() => {
      events().onStatus(true);
    });
    expect(screen.getByText("Connected — click to open")).toBeDefined();
    expect(document.body.dataset.status).toBe("online");
  });

  it("adds a task row on start-task and settles it on finish", () => {
    render(<App />);
    act(() => {
      events().onStartTask({ id: "t1", command: "move-node", args: { id: "1:1" } });
    });
    // Pill + console both render the command; open console to see the feed.
    fireEvent.click(screen.getByLabelText(/Fimake status/));
    expect(screen.getByText("move-node")).toBeDefined();
    expect(screen.getByText("1 task")).toBeDefined();
    act(() => {
      events().onSettle("t1", "done");
    });
    expect(screen.getByText(/1 task/)).toBeDefined();
  });

  it("filters rows and clears finished ones", () => {
    render(<App />);
    act(() => {
      events().onStartTask({ id: "t1", command: "move-node", args: {} });
      events().onStartTask({ id: "t2", command: "resize-node", args: {} });
      events().onSettle("t1", "failed", "boom");
    });
    fireEvent.click(screen.getByLabelText(/Fimake status/));
    expect(screen.getByText("2 tasks")).toBeDefined();

    fireEvent.click(screen.getByText("Failed"));
    expect(screen.queryByText("move-node")).toBeDefined();
    expect(screen.queryByText("resize-node")).toBeNull();

    fireEvent.click(screen.getByText("All"));
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("1 task")).toBeDefined();
    expect(screen.queryByText("move-node")).toBeNull();
  });

  it("dot/console toggle resizes via postMessage", () => {
    const posted: unknown[] = [];
    const orig = window.parent.postMessage;
    window.parent.postMessage = ((msg: unknown) => {
      posted.push(msg);
    }) as typeof window.parent.postMessage;
    try {
      render(<App />);
      fireEvent.click(screen.getByLabelText(/Fimake status/));
      expect(posted).toContainEqual({ pluginMessage: { type: "expand" } });
      fireEvent.click(screen.getByLabelText("Collapse to status pill"));
      expect(posted).toContainEqual({ pluginMessage: { type: "collapse" } });
    } finally {
      window.parent.postMessage = orig;
    }
  });
});
