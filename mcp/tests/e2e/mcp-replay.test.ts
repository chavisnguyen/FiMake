// E2E record-replay: MCP server THẬT + Mock Figma Plugin (fixtures data THẬT).
//
// Flow:
//   vitest --(spawn)--> node dist/index.js (TRANSPORT=streamable-http, real bridge)
//        --(socket.io)--> MockFigmaPlugin (replay fixtures/*.json)
//   vitest --(MCP protocol POST /mcp)--> server --(assert payload khớp fixture)
//
// Chạy: make build && cd mcp && pnpm test
// (cần build trước vì test spawn dist/index.js giống plugin/tests/e2e/ui-loop.spec.ts)
//
// Khi bạn đổi code:
// - thêm tool mới mà chưa record fixture -> test "fixture-missing báo lỗi rõ ràng" pass,
//   và bạn cần chạy `pnpm record:e2e` với Figma thật đang mở để bổ sung fixture.
// - đổi schema/shape response -> assert dưới này fail ngay, không flaky như Figma tay.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockFigmaPlugin } from "./mock-figma-plugin";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_DIR = path.resolve(HERE, "../..");
const DIST_ENTRY = path.join(MCP_DIR, "dist", "index.js");
const PORT = 38991;

let mcp: ChildProcess | undefined;
let mock: MockFigmaPlugin | undefined;

async function waitFor(fn: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function mcpPost(
  body: unknown,
  sessionId?: string,
): Promise<{ status: number; headers: Headers; text: string }> {
  const res = await fetch(`http://localhost:${PORT}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

function ssePayloads(text: string): unknown[] {
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice("data: ".length)) as unknown);
}

/** Lấy text block từ CallToolResult envelope trong SSE payload. */
function toolTextOf(payloads: unknown[]): string {
  const blob = JSON.stringify(payloads);
  const m = blob.match(/"text":"((?:[^"\\]|\\.)*)"/);
  if (!m?.[1]) throw new Error(`no text block in MCP response: ${blob.slice(0, 500)}`);
  return JSON.parse(`"${m[1]}"`) as string;
}

import { SIMPLE_TOOL_DEFS, NODE_WRAPPED_TOOLS } from "../../src/tools/registry";

/** Tool cố tình KHÔNG record: fetch URL ngoài, nhét ảnh lạ vào file + flaky mạng. */
const INTENTIONALLY_UNRECORDED = new Set(["create-image"]);

function fixtureFiles(): string[] {
  return fs
    .readdirSync(path.join(HERE, "fixtures"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort();
}

let sessionId = "";

/** Đọc fixture đã record để test lock đúng data thật (không hardcode template). */
function loadFixture<T>(command: string): { isError: boolean; content: T; args: unknown } {
  const p = path.join(HERE, "fixtures", `${command}.json`);
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as {
    request?: { args?: unknown };
    response?: { isError?: boolean; content?: T };
  };
  return {
    isError: raw.response?.isError ?? false,
    content: raw.response?.content as T,
    args: raw.request?.args ?? {},
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const res = await mcpPost(
    { jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method: "tools/call", params: { name, arguments: args } },
    sessionId,
  );
  expect(res.status).toBe(200);
  const payloads = ssePayloads(res.text);
  const blob = JSON.stringify(payloads);
  const text = toolTextOf(payloads);
  return { text, isError: blob.includes(`"isError":true`) };
}

beforeAll(async () => {
  if (!fs.existsSync(DIST_ENTRY)) {
    throw new Error(`dist not built (${DIST_ENTRY}). Run: make build (root) hoặc cd mcp && pnpm build`);
  }
  mcp = spawn("node", [DIST_ENTRY], {
    cwd: MCP_DIR,
    env: { ...process.env, TRANSPORT: "streamable-http", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitFor(async () => {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, 15000, "mcp /health");

  mock = new MockFigmaPlugin(`http://localhost:${PORT}`);
  await mock.connect();
  expect(mock.fixtureCommands()).toContain("get-pages");

  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e-replay", version: "0" } },
  });
  expect(init.status).toBe(200);
  const sid = init.headers.get("mcp-session-id");
  expect(sid).toBeTruthy();
  sessionId = sid!;
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
}, 60000);

afterAll(async () => {
  mock?.disconnect();
  mcp?.kill("SIGKILL");
});

describe("e2e replay (real MCP + mock plugin, real-data fixtures)", () => {
  it("mọi tool đã đăng ký đều có fixture (trừ create-image không record theo thiết kế)", async () => {
    const registered = new Set<string>([
      ...SIMPLE_TOOL_DEFS.map((d) => d.name),
      ...NODE_WRAPPED_TOOLS,
    ]);
    // Thêm tool mới mà chưa record -> fail ở đây với hướng dẫn rõ ràng,
    // thay vì treo timeout khó debug ở CI.
    for (const name of [...registered].sort()) {
      if (INTENTIONALLY_UNRECORDED.has(name)) continue;
      expect(
        fixtureFiles(),
        `missing fixture for tool "${name}" — run: cd mcp && pnpm record:e2e (Figma Connected)`,
      ).toContain(name);
    }
  });

  it("mọi fixture replay khớp data thật (isError + content deep-equal)", async () => {
    for (const name of fixtureFiles()) {
      // export-file là node-only fan-out: MCP tự tính summary từ nhiều
      // sub-call get-node-info (mock trả cùng 1 canned response cho mọi id),
      // nên chỉ lock shape + isError, không deep-equal số liệu.
      if (name === "export-file") continue;
      const fixture = loadFixture<unknown>(name);
      const args =
        typeof fixture.args === "object" && fixture.args !== null
          ? (fixture.args as Record<string, unknown>)
          : {};
      const { text, isError } = await callTool(name, args);
      expect(isError, `${name}: isError`).toBe(fixture.isError);
      const parsed = JSON.parse(text) as unknown;
      if (name === "get-selection") {
        // get-selection bọc NGUYÊN TaskResult vào text (xem registry +
        // contract test) nên replay ra double-envelope: so inner content.
        expect(parsed).toEqual({ isError: false, content: fixture.content });
        continue;
      }
      // Gọi đúng args đã record + mock echo cùng args -> content phải deep-equal.
      expect(parsed, `${name}: content`).toEqual(fixture.content);
    }
  });

  it("export-file replay giữ shape summary (node-only fan-out)", async () => {
    const fixture = loadFixture<Record<string, unknown>>("export-file");
    const args = fixture.args as Record<string, unknown>;
    const { text, isError } = await callTool("export-file", args);
    expect(isError).toBe(false);
    const summary = JSON.parse(text) as Record<string, unknown>;
    for (const key of Object.keys(fixture.content)) {
      expect(summary, `export-file key ${key}`).toHaveProperty(key);
    }
  });

  it("get-pages lock đúng page đầu tiên của file thật", async () => {
    const fixture = loadFixture<{ id: string; name: string }[]>("get-pages");
    const pages = fixture.content;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.id).toMatch(/^\d+:\d+$/);
    expect(pages[0]?.name).toBeTruthy();
  });

  it("move-node echo x/y qua socket round-trip (giá trị mới, không phải stored)", async () => {
    const nodeFixture = loadFixture<{ id: string }>("get-node-info");
    const nodeId = (nodeFixture.args as { id?: string })?.id ?? nodeFixture.content.id;
    const { text, isError } = await callTool("move-node", { id: nodeId, x: 42, y: 77 });
    expect(isError).toBe(false);
    const node = JSON.parse(text) as { id: string; x: number; y: number };
    expect(node.id).toBe(nodeId);
    expect(node.x).toBe(42);
    expect(node.y).toBe(77);
  });

  it("create-image không record theo thiết kế, fail fast không treo", async () => {
    const { isError, text } = await callTool("create-image", { url: "not-a-url" });
    expect(isError).toBe(true);
    expect(text).toContain("Invalid image URL");
  });
});
