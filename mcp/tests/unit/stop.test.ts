import { describe, it, expect } from "vitest";
import { stopSharedServer } from "../../src/stop";
import type { Exec } from "../../src/install-plugin";

function execOf(stdout: string, stderr = ""): Exec {
  return async () => ({ stdout, stderr });
}

function failingExec(message: string): Exec {
  return async () => {
    throw new Error(message);
  };
}

describe("fimake stop", () => {
  it("stopping the service reports success with a doctor hint", async () => {
    const result = await stopSharedServer(execOf("Successfully stopped `fimake` (label: sh.brew.fimake)\n"));
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Stopped the shared fimake server");
    expect(result.message).toContain("fimake doctor");
  });

  it("service not running is ok, not an error", async () => {
    const result = await stopSharedServer(execOf("Service `fimake` not started.\n"));
    expect(result.ok).toBe(true);
    expect(result.message).toContain("not running");
  });

  it("missing brew explains how to stop a manually started server", async () => {
    const result = await stopSharedServer(failingExec("spawn brew ENOENT"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("brew");
    expect(result.message).toContain("lsof -i :10101");
  });

  it("brew failure surfaces the cause and points at doctor", async () => {
    const result = await stopSharedServer(failingExec("Command failed: brew services stop fimake"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("fimake doctor");
  });
});
