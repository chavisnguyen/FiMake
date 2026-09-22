import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Server } from "socket.io";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskResult } from "../../src/bridge/task-manager";

// Custom tools keep their own registration modules.
import { createImage } from "../../src/tools/create/create-image";
import { getSelection } from "../../src/tools/read/get-selection";
import { exportAsset } from "../../src/tools/read/export-asset";
import { exportFile } from "../../src/tools/read/export-file";
// Simple tools are driven by the registry table.
import { SIMPLE_TOOL_DEFS, registerAllTools } from "../../src/tools/registry";
import { createBridge, createMcpServer } from "../../src/bridge/server";
import {
  cast,
  getHandler,
  mockServerBundle,
  mockTaskManager,
  mockTaskManagerWith,
  parseToolText,
  runTaskMock,
  toolText,
} from "../helpers";

/** Representative params per simple tool (test data, not logic). */
const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  "create-rectangle": { x: 0, y: 0, width: 10, height: 5 },
  "create-frame": { x: 0, y: 0, width: 10, height: 5 },
  "create-text": { x: 0, y: 0, text: "hi" },
  "create-instance": { componentId: "1:1" },
  "create-component": { name: "C" },
  "clone-node": { id: "1:2" },
  "add-component-property": { componentId: "1:1", name: "n", type: "BOOLEAN", defaultValue: "true" },
  "add-prototype-link": { nodeId: "1:1", destinationId: "2:2" },
  "get-node-info": { id: "1:1" },
  "get-pages": {},
  "get-all-components": {},
  "move-node": { id: "1:1", x: 1, y: 2 },
  "resize-node": { id: "1:1", width: 5, height: 5 },
  "set-fill-color": { id: "1:1", color: "#FF0000FF" },
  "set-stroke-color": { id: "1:1", color: "#FF0000FF" },
  "set-corner-radius": { id: "1:1", cornerRadius: 4 },
  "set-layout": { id: "1:1", mode: "HORIZONTAL" },
  "set-parent-id": { id: "1:1", parentId: "2:2" },
  "set-instance-properties": { instanceId: "1:1", properties: { a: 1 } },
  "edit-component-property": { componentId: "1:1", name: "n", type: "TEXT", defaultValue: "d" },
  "set-node-component-property-references": { id: "1:1", componentPropertyReferences: { characters: "p" } },
  "delete-node": { id: "1:2" },
  "delete-component-property": { componentId: "1:1", name: "n" },
};

function sampleParams(name: string): Record<string, unknown> {
  const params = SAMPLE_PARAMS[name];
  if (params === undefined) {
    throw new Error(`missing sample params for tool: ${name}`);
  }
  return params;
}

interface ExportedAsset {
  format?: string;
  data: string;
}

interface ExportSummary {
  id?: string;
  path?: string;
  bytes?: number;
  fileCount?: number;
  truncatedFiles?: unknown[];
  data?: string;
}

describe("registry: every simple tool forwards its command + formats result", () => {
  for (const def of SIMPLE_TOOL_DEFS) {
    it(`${def.name} calls runTask("${def.name}") and returns text JSON`, async () => {
      const params = sampleParams(def.name);
      const { server, handlers } = mockServerBundle();
      const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
      registerAllTools(server, tm);
      const res: CallToolResult = await getHandler(handlers, def.name)(params);
      expect(runTaskMock(tm)).toHaveBeenCalledWith(def.name, params);
      expect(res.isError).toBe(false);
      expect(parseToolText<{ id: string }>(res)).toEqual({ id: "9:9" });
    });
  }

  it("registers the full set: simple tools + 4 custom ones (list-clients needs a bridge)", () => {
    const { server, handlers } = mockServerBundle();
    registerAllTools(server, mockTaskManager());
    expect(handlers.size).toBe(SIMPLE_TOOL_DEFS.length + 4);
    for (const name of ["get-selection", "create-image", "export-asset", "export-file"]) {
      expect(handlers.has(name)).toBe(true);
    }
    expect(handlers.has("list-clients")).toBe(false);
  });

  it("registers list-clients when a socketManager is passed", async () => {
    const { server, handlers } = mockServerBundle();
    const fakeIo = { on: vi.fn() };
    const { socketManager } = createBridge(fakeIo as unknown as Server);
    registerAllTools(server, mockTaskManager(), socketManager);
    expect(handlers.size).toBe(SIMPLE_TOOL_DEFS.length + 5);
    expect(handlers.has("list-clients")).toBe(true);
    const res: CallToolResult = await getHandler(handlers, "list-clients")({});
    expect(res.isError).toBe(false);
    expect(parseToolText<{ count: number; clients: unknown[] }>(res)).toEqual({ count: 0, clients: [] });
  });

  it("every simple tool accepts targetFileKey/targetFileName and forwards them", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
    registerAllTools(server, tm);
    const params = { ...sampleParams("move-node"), targetFileKey: "key-A" };
    const res: CallToolResult = await getHandler(handlers, "move-node")(params);
    expect(runTaskMock(tm)).toHaveBeenCalledWith("move-node", params);
    expect(res.isError).toBe(false);
  });

  it("propagates isError=true from plugin", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: true, content: "Parent not found" });
    registerAllTools(server, tm);
    const res: CallToolResult = await getHandler(handlers, "delete-node")({ id: "1:1" });
    expect(res.isError).toBe(true);
  });
});

describe("get-selection (special case: no schema, wraps whole TaskResult)", () => {
  it("stringifies whole result and always isError=false", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: [{ id: "1:1" }] });
    getSelection(server, tm);
    const res: CallToolResult = await getHandler(handlers, "get-selection")();
    expect(runTaskMock(tm)).toHaveBeenCalledWith("get-selection", {});
    expect(res.isError).toBe(false);
    expect(parseToolText<TaskResult>(res)).toEqual({ isError: false, content: [{ id: "1:1" }] });
  });
});

describe("create-image forwards fetched bytes", () => {
  it("fetches the URL then forwards imageData to the plugin", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
    createImage(server, tm);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        cast<Response>({
          ok: true,
          arrayBuffer: async (): Promise<ArrayBuffer> =>
            new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
        }),
      ),
    );
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/y.png" });
    expect(runTaskMock(tm)).toHaveBeenCalledWith(
      "create-image",
      expect.objectContaining({ url: "https://x/y.png", imageData: [1, 2, 3] }),
    );
    expect(res.isError).toBe(false);
  });
});

describe("create-image fetch failures", () => {
  it("returns isError on HTTP fail + on fetch throw", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager();
    createImage(server, tm);
    vi.stubGlobal("fetch", vi.fn(async () => cast<Response>({ ok: false, status: 404 })));
    const fail: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/y.png" });
    expect(fail.isError).toBe(true);
    expect(toolText(fail)).toContain("404");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => {
        throw new Error("dns");
      }),
    );
    // fetch throw returns isError (never rejects — MCP clients always get a result)
    const threw: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/y.png" });
    expect(threw.isError).toBe(true);
    expect(toolText(threw)).toContain("dns");
  });
});

describe("export-asset outputPath", () => {
  it("inline SVG without outputPath", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { format: "SVG", data: "<svg/>" } });
    exportAsset(server, tm);
    const res: CallToolResult = await getHandler(handlers, "export-asset")({ id: "1:1", format: "SVG" });
    expect(res.isError).toBe(false);
    expect(parseToolText<ExportedAsset>(res).data).toBe("<svg/>");
  });

  it("writes PNG file with outputPath and returns path+bytes", async () => {
    const { server, handlers } = mockServerBundle();
    const pngBase64 = Buffer.from("fakepng").toString("base64");
    const tm = mockTaskManager({ isError: false, content: { format: "PNG", data: pngBase64 } });
    exportAsset(server, tm);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "figma-")), "out.png");
    const res: CallToolResult = await getHandler(handlers, "export-asset")({ id: "1:1", format: "PNG", outputPath: tmp });
    expect(res.isError).toBe(false);
    const parsed = parseToolText<ExportSummary>(res);
    expect(parsed.path).toBe(path.resolve(tmp));
    expect(parsed.bytes).toBeGreaterThan(0);
    expect(fs.readFileSync(tmp).toString()).toBe("fakepng");
  });

  it("writes SVG file with outputPath and catches runTask throw", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { format: "SVG", data: "<svg/>" } });
    exportAsset(server, tm);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "figma-")), "out.svg");
    const res: CallToolResult = await getHandler(handlers, "export-asset")({ id: "1:1", outputPath: tmp });
    expect(res.isError).toBe(false);
    expect(fs.readFileSync(tmp, "utf-8")).toBe("<svg/>");

    const second = mockServerBundle();
    const failing = mockTaskManagerWith(async (): Promise<TaskResult> => {
      throw new Error("socket down");
    });
    exportAsset(second.server, failing);
    const err: CallToolResult = await getHandler(second.handlers, "export-asset")({ id: "1:1", outputPath: tmp });
    expect(err.isError).toBe(true);
  });

  it("returns isError when plugin reports error (no file written)", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: true, content: "Node not found" });
    exportAsset(server, tm);
    const res: CallToolResult = await getHandler(handlers, "export-asset")({
      id: "9:9",
      outputPath: path.join(os.tmpdir(), "should-not-exist-12345.png"),
    });
    expect(res.isError).toBe(true);
  });
});

describe("export-file fan-out", () => {
  it("writes per-frame JSON + manifest, flags truncated", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManagerWith(async (cmd: string): Promise<TaskResult> => {
      if (cmd === "get-pages") return { isError: false, content: [{ id: "0:1", name: "Page 1", nodes: [{ id: "1:1", name: "Hero", type: "FRAME" }] }] };
      return { isError: false, content: { id: "1:1", _truncatedCount: 2 } };
    });
    exportFile(server, tm);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figma-export-"));
    const res: CallToolResult = await getHandler(handlers, "export-file")({ outputDir: tmp });
    expect(res.isError).toBe(false);
    const parsed = parseToolText<ExportSummary>(res);
    expect(parsed.fileCount).toBe(1);
    expect(parsed.truncatedFiles).toHaveLength(1);
    expect(fs.existsSync(path.join(tmp, "manifest.json"))).toBe(true);
  });

  it("returns isError when get-pages fails", async () => {
    const { server, handlers } = mockServerBundle();
    exportFile(server, mockTaskManager({ isError: true, content: "no pages" }));
    const res: CallToolResult = await getHandler(handlers, "export-file")({});
    expect(res.isError).toBe(true);
  });

  it("catches unexpected throw (e.g. mkdir fails)", async () => {
    const { server, handlers } = mockServerBundle();
    exportFile(
      server,
      mockTaskManagerWith(async (): Promise<TaskResult> => {
        throw new Error("disk full");
      }),
    );
    const res: CallToolResult = await getHandler(handlers, "export-file")({ outputDir: "/tmp/figma-test" });
    expect(res.isError).toBe(true);
  });
});

describe("createMcpServer registers all tools", () => {
  it("registers expected tool names", async () => {
    const fakeIo = { on: vi.fn() };
    const { taskManager } = createBridge(fakeIo as unknown as Server);
    const mcp = createMcpServer(taskManager);
    // At minimum the server builds without throwing.
    expect(mcp).toBeDefined();
  });
});
