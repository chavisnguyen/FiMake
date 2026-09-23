import { describe, it, expect } from "vitest";
import { formatDoctorReport, runDoctor } from "../../src/doctor";
import { cast } from "../helpers";

type FetchImpl = Parameters<typeof runDoctor>[1];

function fetchOf(impl: (url: string) => Promise<unknown>): FetchImpl {
  return cast<FetchImpl>(impl);
}

describe("fimake doctor", () => {
  it("port free (refused) → ok, exit-0 report", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    const report = await runDoctor(10101, fetchOf(async () => {
      throw refused;
    }));
    expect(report.ok).toBe(true);
    // version + port + plugin (added in P3 — best-effort, never affects `ok`).
    expect(report.checks).toHaveLength(3);
    expect(formatDoctorReport(report)).toContain("[ok] port");
    expect(formatDoctorReport(report)).toContain("doctor: ready");
  });

  it("healthy fimake on port → conflict with window names", async () => {
    const report = await runDoctor(10101, fetchOf(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        transport: "streamable-http",
        pluginConnected: true,
        clients: [{ fileName: "Landing page", fileKey: "k1", connectedAt: 1 }],
      }),
    })));
    expect(report.ok).toBe(false);
    const text = formatDoctorReport(report);
    expect(text).toContain("[!!] port");
    expect(text).toContain("Landing page");
    expect(text).toContain("stop that server first");
    expect(text).toContain("doctor: action needed");
  });

  it("no windows connected → still conflict, says so", async () => {
    const report = await runDoctor(10101, fetchOf(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, clients: [] }),
    })));
    expect(report.ok).toBe(false);
    expect(formatDoctorReport(report)).toContain("no plugin windows");
  });

  it("foreign service on port → conflict, not mistaken for fimake", async () => {
    const report = await runDoctor(10101, fetchOf(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hello: "not fimake" }),
    })));
    expect(report.ok).toBe(false);
    expect(formatDoctorReport(report)).toContain("not a fimake server");
  });

  it("unreachable for other reasons → actionable error, no crash", async () => {
    const report = await runDoctor(10101, fetchOf(async () => {
      throw new Error("boom");
    }));
    expect(report.ok).toBe(false);
    expect(formatDoctorReport(report)).toContain("boom");
  });
});

describe("listen helper", () => {
  it("detects EADDRINUSE, ignores other errors", async () => {
    const { isAddrInUse, friendlyPortMessage } = await import("../../src/transport/listen");
    expect(isAddrInUse(Object.assign(new Error("listen"), { code: "EADDRINUSE" }))).toBe(true);
    expect(isAddrInUse(new Error("nope"))).toBe(false);
    expect(isAddrInUse(null)).toBe(false);
    expect(friendlyPortMessage(10101)).toContain("Do NOT start the server by hand");
    expect(friendlyPortMessage(10101)).toContain("fimake doctor");
  });
});
