// Record fixtures từ Figma THẬT — phủ full 27 tools.
//
// Dùng khi: Figma Desktop đang mở + plugin Fimake (bản mới nhất) Connected.
// Script gọi MCP server thật (nối plugin thật), dump response vào
// tests/e2e/fixtures/*.json để E2E replay dùng ở CI.
//
// Chạy:
//   1. Mở Figma, chạy plugin Fimake (Connected).
//   2. Chạy MCP server:  cd mcp && TRANSPORT=streamable-http PORT=10101 pnpm start
//   3. Record:           cd mcp && RECORD_PORT=10101 RECORD_NODE_ID=113:24364 pnpm record:e2e
//
// An toàn file của bạn: mọi write-tool chạy trong 1 frame sandbox
// "fimake-e2e-sandbox" ở tọa độ xa (-5000,-5000), cuối script tự xóa.
// Chỉ còn lại đúng 1 thay đổi vĩnh viễn tiềm năng: KHÔNG có (sandbox bị xóa).
//
// Ngoại lệ duy nhất: `create-image` KHÔNG record (cần fetch URL ngoài,
// nhét ảnh lạ vào file bạn + flaky mạng) — E2E dùng nó làm case
// "thiếu fixture báo lỗi rõ ràng".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "fixtures");
const PORT = Number(process.env["RECORD_PORT"] ?? "10101");
const NODE_ID = process.env["RECORD_NODE_ID"] ?? "1:1";

interface ToolResult {
  isError: boolean;
  content: unknown;
}

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

function extractText(payloads: unknown[]): { text: string; isError: boolean } {
  const blob = JSON.stringify(payloads);
  const m = blob.match(/"text":"((?:[^"\\]|\\.)*)"/);
  if (!m?.[1]) throw new Error(`no text block: ${blob.slice(0, 300)}`);
  return { text: JSON.parse(`"${m[1]}"`) as string, isError: blob.includes(`"isError":true`) };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function contentId(content: unknown): string | undefined {
  if (typeof content === "object" && content !== null && typeof (content as { id?: unknown }).id === "string") {
    return (content as { id: string }).id;
  }
  return undefined;
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
  let n = 0;

  const call = async (command: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const res = await mcpPost(
      { jsonrpc: "2.0", id: 1000 + n, method: "tools/call", params: { name: command, arguments: args } },
      sid,
    );
    const { text, isError } = extractText(ssePayloads(res.text));
    return { isError, content: tryJson(text) };
  };

  const rec = async (command: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const r = await call(command, args);
    const out = {
      _meta: {
        command,
        recordedAt: new Date().toISOString(),
        source: "real-figma",
        note: "Overwrite bằng pnpm record:e2e khi Figma thật đang Connected.",
      },
      request: { command, args },
      response: r,
    };
    fs.writeFileSync(path.join(FIXTURES_DIR, `${command}.json`), JSON.stringify(out, null, 2) + "\n");
    n += 1;
    console.log(`[${n}] recorded ${command} args=${JSON.stringify(args).slice(0, 80)} isError=${r.isError}`);
    return r;
  };

  // ---- reads không cần setup ----
  await rec("get-pages", {});
  await rec("get-all-components", {});
  await rec("get-selection", {});
  await rec("get-node-info", { id: NODE_ID });

  // ---- sandbox cho write-tools ----
  const sb = await rec("create-frame", {
    x: -5000,
    y: -5000,
    width: 600,
    height: 600,
    name: "fimake-e2e-sandbox",
  });
  const sbId = contentId(sb.content);
  if (!sbId) throw new Error("không tạo được sandbox frame — dừng để khỏi rác file. Xem log create-frame.");
  console.log(`sandbox: ${sbId}`);

  const rect = await rec("create-rectangle", { x: 10, y: 10, width: 100, height: 50, name: "e2e-rect", parentId: sbId });
  const rectId = contentId(rect.content);
  const txt = await rec("create-text", { x: 10, y: 80, text: "e2e", parentId: sbId });
  const textId = contentId(txt.content);
  const comp = await rec("create-component", { name: "E2EComp", parentId: sbId });
  const compId = contentId(comp.content);

  let instanceId: string | undefined;
  if (compId) {
    const inst = await rec("create-instance", { componentId: compId, parentId: sbId, x: 200, y: 10 });
    instanceId = contentId(inst.content);
  }

  if (compId) {
    await rec("add-component-property", {
      componentId: compId,
      name: "Label",
      type: "TEXT",
      defaultValue: "hi",
    });
    await rec("edit-component-property", {
      componentId: compId,
      name: "Label",
      type: "TEXT",
      defaultValue: "hello",
    });
  }
  if (instanceId) {
    await rec("set-instance-properties", { instanceId, properties: { Label: "hello" } });
    await rec("set-node-component-property-references", {
      id: instanceId,
      componentPropertyReferences: { characters: "Label" },
    });
  }

  let cloneId: string | undefined;
  if (rectId) {
    const cl = await rec("clone-node", { id: rectId });
    cloneId = contentId(cl.content);
    await rec("move-node", { id: rectId, x: 42, y: 77 });
    await rec("resize-node", { id: rectId, width: 120, height: 60 });
    await rec("set-fill-color", { id: rectId, color: "#FF0000FF" });
    await rec("set-stroke-color", { id: rectId, color: "#00FF00FF" });
    await rec("set-corner-radius", { id: rectId, cornerRadius: 8 });
    await rec("set-layout", { id: sbId, mode: "HORIZONTAL", itemSpacing: 8 });
    await rec("get-node-info", { id: rectId });
  }
  if (cloneId) {
    await rec("set-parent-id", { id: cloneId, parentId: sbId });
  }
  if (rectId && textId) {
    await rec("add-prototype-link", { nodeId: rectId, destinationId: textId });
  }
  if (compId) {
    await rec("delete-component-property", { componentId: compId, name: "Label" });
  }
  if (cloneId) {
    await rec("delete-node", { id: cloneId });
  }

  // ---- export (read-only, không chạm file Figma) ----
  await rec("export-asset", { id: NODE_ID, format: "SVG" });
  await rec("export-file", { outputDir: path.join(os.tmpdir(), "fimake-e2e-record") });

  // ---- dọn sandbox (KHÔNG record — chỉ cleanup) ----
  const cleanup = await call("delete-node", { id: sbId });
  console.log(`cleanup sandbox ${sbId}: isError=${cleanup.isError}`);
  if (cleanup.isError) {
    console.warn(`XÓA TAY frame "fimake-e2e-sandbox" (${sbId}) trong Figma giúp mình.`);
  }
  // Sandbox (và mọi node trong nó) đã bị xóa — record lại get-node-info trên
  // node thật bền vững để fixture không trỏ vào node đã chết.
  await rec("get-node-info", { id: NODE_ID });
  console.log(`Done (${n} fixtures). Review: git diff mcp/tests/e2e/fixtures`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
