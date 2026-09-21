// Record fixtures từ Figma THẬT.
//
// Dùng khi: Figma Desktop đang mở + plugin Fimake đang Connected.
// Script này gọi MCP server thật (đang nối với plugin thật) và dump response
// vào tests/e2e/fixtures/*.json để E2E replay dùng ở CI.
//
// Chạy:
//   1. Mở Figma, chạy plugin Fimake (Connected), chạy MCP server:
//        cd mcp && TRANSPORT=streamable-http PORT=10101 pnpm start
//   2. Ở terminal khác:
//        cd mcp && RECORD_PORT=10101 pnpm record:e2e
//
// Sau khi record xong, `git diff tests/e2e/fixtures` chính là thay đổi data thật
// sau khi bạn sửa code — review diff này trước khi push.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "fixtures");
const PORT = Number(process.env["RECORD_PORT"] ?? "10101");

interface Case {
  command: string;
  args: Record<string, unknown>;
}

const CASES: Case[] = [
  { command: "get-pages", args: {} },
  { command: "get-all-components", args: {} },
  { command: "get-selection", args: {} },
  // Node id mặc định: sửa RECORD_NODE_ID nếu file Figma của bạn khác.
  { command: "get-node-info", args: { id: process.env["RECORD_NODE_ID"] ?? "1:1" } },
];

async function mcpPost(body: unknown, sessionId?: string): Promise<{ status: number; headers: Headers; text: string }> {
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

async function main(): Promise<void> {
  const init = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "record", version: "0" } },
  });
  if (init.status !== 200) throw new Error(`initialize failed: ${init.status} ${init.text.slice(0, 300)}`);
  const sid = init.headers.get("mcp-session-id");
  if (!sid) throw new Error("no mcp-session-id (server có chạy TRANSPORT=streamable-http không?)");
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  for (const c of CASES) {
    const res = await mcpPost(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: c.command, arguments: c.args } },
      sid,
    );
    const payloads = ssePayloads(res.text);
    const blob = JSON.stringify(payloads);
    const m = blob.match(/"text":"((?:[^"\\]|\\.)*)"/);
    if (!m?.[1]) throw new Error(`no text block for ${c.command}: ${blob.slice(0, 300)}`);
    const text: string = JSON.parse(`"${m[1]}"`);
    const isError = blob.includes(`"isError":true`);
    let content: unknown = text;
    try {
      content = JSON.parse(text) as unknown;
    } catch {
      // giữ nguyên string
    }
    const out = {
      _meta: {
        command: c.command,
        recordedAt: new Date().toISOString(),
        source: "real-figma",
        note: "Overwrite bằng pnpm record:e2e khi Figma thật đang Connected.",
      },
      request: { command: c.command, args: c.args },
      response: { isError, content },
    };
    fs.writeFileSync(path.join(FIXTURES_DIR, `${c.command}.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`recorded ${c.command} (isError=${isError})`);
  }
  console.log("Done. Review: git diff mcp/tests/e2e/fixtures");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
