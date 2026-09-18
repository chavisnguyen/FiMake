import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../../src/bridge/orchestrator";
import {
  asSocketManager,
  asTaskManager,
  firstCallArg,
  mockOrchestratorSocketManager,
  mockOrchestratorTaskManager,
  type OnTaskErrorCallback,
  type OnTaskFinishedCallback,
  type TaskAddedListener,
} from "../helpers";

describe("Orchestrator wiring", () => {
  it("forwards added task to socket as start-task", () => {
    const sendMessage = vi.fn();
    const taskManagerMock = mockOrchestratorTaskManager();
    const socketManagerMock = mockOrchestratorSocketManager(sendMessage);
    new Orchestrator(asSocketManager(socketManagerMock), asTaskManager(taskManagerMock));
    const onAdded = firstCallArg<TaskAddedListener>(taskManagerMock.onTaskAdded);
    const task = { id: "t1", command: "move-node", args: {} };
    onAdded(task);
    expect(sendMessage).toHaveBeenCalledWith("start-task", task);
  });

  it("marks task completed on task-finished", () => {
    const taskManagerMock = mockOrchestratorTaskManager();
    const socketManagerMock = mockOrchestratorSocketManager();
    new Orchestrator(asSocketManager(socketManagerMock), asTaskManager(taskManagerMock));
    const onFinished = firstCallArg<OnTaskFinishedCallback>(socketManagerMock.onTaskFinished);
    onFinished({ taskId: "t1", content: { ok: 1 }, isError: false });
    expect(taskManagerMock.updateTask).toHaveBeenCalledWith("t1", { ok: 1 }, "completed");
  });

  it("marks task failed on task-failed", () => {
    const taskManagerMock = mockOrchestratorTaskManager();
    const socketManagerMock = mockOrchestratorSocketManager();
    new Orchestrator(asSocketManager(socketManagerMock), asTaskManager(taskManagerMock));
    const onError = firstCallArg<OnTaskErrorCallback>(socketManagerMock.onTaskError);
    onError({ taskId: "t2", content: "boom", isError: true });
    expect(taskManagerMock.updateTask).toHaveBeenCalledWith("t2", "boom", "failed");
  });
});
