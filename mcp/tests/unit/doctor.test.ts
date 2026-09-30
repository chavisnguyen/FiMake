import { describe, it, expect } from "vitest";
import { formatDoctorReport, runDoctor } from "../../src/doctor";
import { cast } from "../helpers";

type FetchImpl = Parameters<typeof runDoctor>[1];

function fetchOf(impl: (url: string) => Promise<unknown>): FetchImpl {
  return cast<FetchImpl>(impl);
}

function healthOf(body: unknown): FetchImpl {
  return fetchOf(async () => ({ ok: true, status: 200, json: async () => body }));
}

describe("fimake doctor", () => {
  it("shared http server up → ready, lists windows", async () => {
    const report = await runDoctor(10101, healthOf({
      ok: true,
      transport: "streamable-http",
      pluginConnected: true,
      clients: [{ fileName: "Landing page", fileKey: "k1", connectedAt: 1 }],
    }));
    expect(report.ok).toBe(true);
    // version + server + plugin (plugin is best-effort, never affects `ok`).
    expect(report.checks).toHaveLength(3);
    const text = formatDoctorReport(report);
    expect(text).toContain("[ok] server");
    expect(text).toContain("http://localhost:10101/mcp");
    expect(text).toContain("Landing page");
    expect(text).toContain("doctor: ready");
  });

  it("port free (refused) → not running, says how to start it", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    const report = await runDoctor(10101, fetchOf(async () => {
      throw refused;
    }));
    expect(report.ok).toBe(false);
    expect(formatDoctorReport(report)).toContain("brew services start fimake");
  });

  it("stdio-spawned fimake holds the port → conflict, switch client to URL", async () => {
    const report = await runDoctor(10101, healthOf({ ok: true, transport: "stdio", clients: [] }));
    expect(report.ok).toBe(false);
    const text = formatDoctorReport(report);
    expect(text).toContain("spawned via stdio");
    expect(text).toContain("no plugin windows");
    expect(text).toContain("doctor: action needed");
  });

  it("foreign service on port → conflict, not mistaken for fimake", async () => {
    const report = await runDoctor(10101, healthOf({ hello: "not fimake" }));
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
    expect(friendlyPortMessage(10101)).toContain("brew services start fimake");
    expect(friendlyPortMessage(10101)).toContain("fimake doctor");
  });

  it("accepts loopback only", async () => {
    const { isLoopback } = await import("../../src/transport/listen");
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(a)).toBe(true);
    for (const a of ["192.168.1.5", "::ffff:10.0.0.2", "fe80::1", undefined]) expect(isLoopback(a)).toBe(false);
  });
});

describe("/mcp origin guard", () => {
  it("allows CLI (no Origin) and local pages, blocks other sites", async () => {
    const { isAllowedOrigin } = await import("../../src/transport/streamable-http");
    expect(isAllowedOrigin(undefined, "*")).toBe(true);
    expect(isAllowedOrigin("http://localhost:6274", "*")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", "*")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "*")).toBe(false);
    expect(isAllowedOrigin("null", "*")).toBe(false);
    expect(isAllowedOrigin("https://app.example", "https://app.example")).toBe(true);
  });
});
