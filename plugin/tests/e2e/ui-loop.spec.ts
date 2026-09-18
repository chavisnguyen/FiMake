// Full-loop E2E: real mcp server + real built UI bundle.
// Only the Figma main thread is faked (reply TASK_FINISHED to START_TASK).
// Run: make build && cd plugin && pnpm test:e2e
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const MCP_PORT = 38451;
const STATIC_PORT = 8123;
const MCP_DIR = path.resolve(ROOT, "../mcp");
const DIST_DIR = path.resolve(ROOT, "dist");

let mcp: ChildProcess | undefined;
let staticServer: http.Server | undefined;

async function waitFor(fn: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function mcpPost(body: unknown, sessionId?: string): Promise<{ status: number; headers: Headers; text: string }> {
  const res = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
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

function sseData(text: string): unknown[] {
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice("data: ".length)) as unknown);
}

test.beforeAll(async () => {
  mcp = spawn("node", ["dist/index.js"], {
    cwd: MCP_DIR,
    env: { ...process.env, TRANSPORT: "streamable-http", PORT: String(MCP_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mcp.stderr?.on("data", (d) => process.stderr.write(`[mcp] ${d}`));
  await waitFor(async () => {
    try {
      const res = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
      });
      await res.text().catch(() => "");
      return true;
    } catch {
      return false;
    }
  }, 15000, "mcp server");

  staticServer = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html" || req.url?.startsWith("/index.html?")) {
      const html = fs.readFileSync(path.join(DIST_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve) => staticServer!.listen(STATIC_PORT, resolve));
});

test.afterAll(async () => {
  staticServer?.close();
  mcp?.kill("SIGKILL");
});

test("task goes UI -> fake main thread -> back, MCP call resolves", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Swallow START_TASK locally (in Figma the host receives it); let every
  // other pluginMessage through so the harness can reply TASK_FINISHED.
  await page.addInitScript(() => {
    const w = window as unknown as { __sent: unknown[] };
    w.__sent = [];
    const orig = window.postMessage.bind(window);
    window.postMessage = ((msg: unknown, ...rest: unknown[]) => {
      w.__sent.push(msg);
      const name = (msg as { pluginMessage?: unknown })?.pluginMessage;
      if (Array.isArray(name) && name[0] === "START_TASK") return undefined;
      return (orig as (...a: unknown[]) => unknown)(msg, ...rest);
    }) as typeof window.postMessage;
  });

  await page.goto(`http://localhost:${STATIC_PORT}/index.html?port=${MCP_PORT}`);
  await expect(page.getByText("Connected — click to open")).toBeVisible({ timeout: 15000 });
  // Pill view is default — open the console to see the task feed.
  await page.locator("#dot").click();

  // MCP handshake.
  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } },
  });
  expect(init.status).toBe(200);
  const sessionId = init.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId!);

  // Fire a real tool call (don't await — it resolves when the task settles).
  const callPromise = mcpPost(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "move-node", arguments: { id: "1:1", x: 1, y: 2 } } },
    sessionId!,
  );

  // UI must show the task row…
  const row = page.locator(".task", { hasText: "move-node" });
  await expect(row).toBeVisible({ timeout: 15000 });
  const taskId = await row.getAttribute("data-task-id");
  expect(taskId).toBeTruthy();

  // …then the fake Figma main thread replies TASK_FINISHED…
  await page.evaluate((id) => {
    window.postMessage(
      { pluginMessage: ["TASK_FINISHED", { name: "TASK_FINISHED", taskId: id, content: { ok: 1 }, isError: false }] },
      "*",
    );
  }, taskId);
  expect(await row.getAttribute("data-status")).toBe("done");

  // …and the MCP call resolves instead of timing out.
  const result = await callPromise;
  expect(result.status).toBe(200);
  const payloads = sseData(result.text);
  expect(JSON.stringify(payloads)).toContain("ok");

  expect(pageErrors).toEqual([]);
});
