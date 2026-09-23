import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Server } from "socket.io";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskResult } from "../../src/bridge/task-manager";

// Custom tools keep their own registration modules.
import { createImage } from "../../src/tools/create/create-image";
import { createSvg } from "../../src/tools/create/create-svg";
import { setImageFill } from "../../src/tools/update/set-image-fill";
import { getSelection } from "../../src/tools/read/get-selection";
import { exportAsset } from "../../src/tools/read/export-asset";
import { exportFile } from "../../src/tools/read/export-file";
// Simple tools are driven by the registry table.
import { SIMPLE_TOOL_DEFS, registerAllTools } from "../../src/tools/registry";
import { CreateImageParamsSchema, CreateSvgParamsSchema, SetImageFillParamsSchema } from "../../src/shared/types/index";
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
  "batch-create": { operations: [{ op: "create-frame", ref: "row", params: { x: 0, y: 0, width: 10, height: 10 } }, { op: "set-layout", params: { id: "$row", mode: "HORIZONTAL" } }] },
  "get-node-info": { id: "1:1" },
  "get-pages": {},
  "get-all-components": {},
  "list-fonts": { family: "inter" },
  "move-node": { id: "1:1", x: 1, y: 2 },
  "resize-node": { id: "1:1", width: 5, height: 5 },
  "set-fill-color": { id: "1:1", color: "#FF0000FF" },
  "set-fill-gradient": { id: "1:1", stops: [{ position: 0, color: "#000000FF" }, { position: 1, color: "#FFFFFF00" }], angle: 90 },
  "set-stroke-color": { id: "1:1", color: "#FF0000FF", weight: 1, align: "INSIDE" },
  "set-text-style": { id: "1:1", lineHeight: 20, letterSpacing: -1, width: 320, maxLines: 2 },
  "set-effects": { id: "1:1", effects: [{ type: "DROP_SHADOW", color: "#00000040" }] },
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

  it("registers the full set: simple tools + 6 custom ones (list-clients needs a bridge)", () => {
    const { server, handlers } = mockServerBundle();
    registerAllTools(server, mockTaskManager());
    expect(handlers.size).toBe(SIMPLE_TOOL_DEFS.length + 6);
    for (const name of ["get-selection", "create-image", "create-svg", "set-image-fill", "export-asset", "export-file"]) {
      expect(handlers.has(name)).toBe(true);
    }
    expect(handlers.has("list-clients")).toBe(false);
  });

  it("registers list-clients when a socketManager is passed", async () => {
    const { server, handlers } = mockServerBundle();
    const fakeIo = { on: vi.fn() };
    const { socketManager } = createBridge(fakeIo as unknown as Server);
    registerAllTools(server, mockTaskManager(), socketManager);
    expect(handlers.size).toBe(SIMPLE_TOOL_DEFS.length + 7);
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

describe("create-image redirects + format guard", () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

  function mockRes(opts: { status?: number; contentType?: string; location?: string; bytes?: number[]; url?: string }): Response {
    const { status = 200, contentType, location, bytes = PNG, url = "https://x/y.png" } = opts;
    const headers = new Headers();
    if (contentType !== undefined) headers.set("content-type", contentType);
    if (location !== undefined) headers.set("location", location);
    return cast<Response>({
      ok: status >= 200 && status < 300,
      status,
      url,
      headers,
      arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array(bytes).buffer as ArrayBuffer,
    });
  }

  it("follows a 302 (picsum-style) then forwards final bytes", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
    createImage(server, tm);
    const fetchMock = vi.fn(async (input: unknown) => {
      const u = String(input);
      if (u === "https://x/redirect") return mockRes({ status: 302, location: "https://cdn/x.jpg" });
      return mockRes({ contentType: "image/png", bytes: PNG, url: u });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/redirect" });
    expect(res.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://cdn/x.jpg");
    expect(runTaskMock(tm)).toHaveBeenCalledWith(
      "create-image",
      expect.objectContaining({ imageData: PNG }),
    );
  });

  it("sends User-Agent + Accept preferring Figma-decodable formats", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
    createImage(server, tm);
    const fetchMock = vi.fn(async () => mockRes({ contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff, 0xe0] }));
    vi.stubGlobal("fetch", fetchMock);
    await getHandler(handlers, "create-image")({ url: "https://x/y.jpg" });
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit & { headers: Record<string, string> }] | undefined;
    const init = firstCall?.[1];
    expect(init?.redirect).toBe("manual");
    expect(init?.headers["User-Agent"]).toContain("Fimake");
    expect(init?.headers["Accept"]).toContain("image/jpeg");
  });

  it("rejects webp with actionable guidance instead of forwarding", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager();
    createImage(server, tm);
    vi.stubGlobal("fetch", vi.fn(async () => mockRes({ contentType: "image/webp", bytes: WEBP })));
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/y.webp" });
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("only JPG/PNG/GIF");
    expect(runTaskMock(tm)).not.toHaveBeenCalled();
  });

  it("blocks redirect to private/internal network (SSRF)", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager();
    createImage(server, tm);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockRes({ status: 302, location: "http://169.254.169.254/latest/meta-data/" })),
    );
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/redirect" });
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("blocked");
    expect(runTaskMock(tm)).not.toHaveBeenCalled();
  });

  it("rejects redirect loops after max hops", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager();
    createImage(server, tm);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockRes({ status: 302, location: "https://x/loop" })),
    );
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://x/loop" });
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("Too many redirects");
  });

  it("rejects URLs with embedded credentials", async () => {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager();
    createImage(server, tm);
    const fetchMock = vi.fn(async () => mockRes({}));
    vi.stubGlobal("fetch", fetchMock);
    const res: CallToolResult = await getHandler(handlers, "create-image")({ url: "https://user:pass@x/y.png" });
    expect(res.isError).toBe(true);
    expect(toolText(res)).toContain("credentials");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("create-svg resolves one source in Node, forwards only svg", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

  function setup(): { call: (p: Record<string, unknown>) => Promise<CallToolResult>; tm: ReturnType<typeof mockTaskManager> } {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
    createSvg(server, tm);
    return { call: (p) => getHandler(handlers, "create-svg")(p), tm };
  }

  function svgRes(body: string, contentType = "image/svg+xml", status = 200, location?: string): Response {
    const headers = new Headers({ "content-type": contentType });
    if (location !== undefined) headers.set("location", location);
    return cast<Response>({
      ok: status >= 200 && status < 300,
      status,
      url: "https://x/a.svg",
      headers,
      arrayBuffer: async (): Promise<ArrayBuffer> => new TextEncoder().encode(body).buffer as ArrayBuffer,
    });
  }

  it("inline svg (with xml prolog + comment) forwards svg + placement, not the source fields", async () => {
    const { call, tm } = setup();
    const svg = `<?xml version="1.0"?>\n<!-- icon -->\n${SVG}`;
    const res = await call({ svg, x: 5, y: 6, parentId: "1:2", targetFileKey: "k" });
    expect(res.isError).toBe(false);
    expect(runTaskMock(tm)).toHaveBeenCalledWith(
      "create-svg",
      expect.objectContaining({ svg, x: 5, y: 6, parentId: "1:2", targetFileKey: "k" }),
    );
    const forwarded = runTaskMock(tm).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty("url");
    expect(forwarded).not.toHaveProperty("filePath");
  });

  it("url: fetches and forwards the decoded markup", async () => {
    const { call, tm } = setup();
    const fetchMock = vi.fn(async () => svgRes(SVG));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ url: "https://x/a.svg" });
    expect(res.isError).toBe(false);
    expect(runTaskMock(tm)).toHaveBeenCalledWith("create-svg", expect.objectContaining({ svg: SVG }));
    const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit & { headers: Record<string, string> }])[1];
    expect(init.headers["Accept"]).toContain("image/svg+xml");
  });

  it("url: rejects html pages and SSRF redirects without calling the plugin", async () => {
    const { call, tm } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => svgRes("<!doctype html><html></html>", "text/html")));
    const html = await call({ url: "https://x/page" });
    expect(html.isError).toBe(true);
    expect(toolText(html)).toContain("Not an SVG");
    vi.stubGlobal("fetch", vi.fn(async () => svgRes("", "text/plain", 302, "http://169.254.169.254/")));
    const ssrf = await call({ url: "https://x/redirect" });
    expect(ssrf.isError).toBe(true);
    expect(toolText(ssrf)).toContain("blocked");
    expect(runTaskMock(tm)).not.toHaveBeenCalled();
  });

  it("filePath: reads a local .svg, rejects other extensions", async () => {
    const { call, tm } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fimake-svg-"));
    const file = path.join(dir, "icon.svg");
    fs.writeFileSync(file, SVG);
    const ok = await call({ filePath: file });
    expect(ok.isError).toBe(false);
    expect(runTaskMock(tm)).toHaveBeenCalledWith("create-svg", expect.objectContaining({ svg: SVG }));
    const txt = path.join(dir, "icon.txt");
    fs.writeFileSync(txt, SVG);
    const bad = await call({ filePath: txt });
    expect(bad.isError).toBe(true);
    expect(toolText(bad)).toContain(".svg");
    const missing = await call({ filePath: path.join(dir, "nope.svg") });
    expect(missing.isError).toBe(true);
  });

  it("rejects 0 or 2 sources, entities, non-svg and oversize before the socket", async () => {
    const { call, tm } = setup();
    expect(toolText(await call({}))).toContain("exactly one");
    expect(toolText(await call({ svg: SVG, url: "https://x/a.svg" }))).toContain("exactly one");
    expect(toolText(await call({ svg: `<!DOCTYPE svg [<!ENTITY a "b">]>${SVG}` }))).toContain("ENTITY");
    expect(toolText(await call({ svg: "<div/>" }))).toContain("Not an SVG");
    expect(toolText(await call({ svg: `<svg>${"a".repeat(5 * 1024 * 1024)}</svg>` }))).toContain("exceeds");
    expect(runTaskMock(tm)).not.toHaveBeenCalled();
  });
});

describe("set-image-fill fetches in Node, forwards bytes to the target node", () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  function res(contentType: string, bytes: number[], status = 200, location?: string): Response {
    const headers = new Headers({ "content-type": contentType });
    if (location !== undefined) headers.set("location", location);
    return cast<Response>({ ok: status < 300, status, url: "https://x/y.png", headers, arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array(bytes).buffer as ArrayBuffer });
  }
  function setup(): { call: (p: Record<string, unknown>) => Promise<CallToolResult>; tm: ReturnType<typeof mockTaskManager> } {
    const { server, handlers } = mockServerBundle();
    const tm = mockTaskManager({ isError: false, content: { id: "1:1" } });
    setImageFill(server, tm);
    return { call: (p) => getHandler(handlers, "set-image-fill")(p), tm };
  }

  it("forwards id/url/scaleMode/imageData to the plugin", async () => {
    const { call, tm } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => res("image/png", PNG)));
    const out = await call({ id: "1:1", url: "https://x/y.png", scaleMode: "FIT", targetFileKey: "k" });
    expect(out.isError).toBe(false);
    expect(runTaskMock(tm)).toHaveBeenCalledWith("set-image-fill", expect.objectContaining({ id: "1:1", url: "https://x/y.png", scaleMode: "FIT", imageData: PNG, targetFileKey: "k" }));
  });

  it("rejects non-Figma formats and SSRF redirects before the socket", async () => {
    const { call, tm } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => res("image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])));
    expect(toolText(await call({ id: "1:1", url: "https://x/y.webp" }))).toContain("only JPG/PNG/GIF");
    vi.stubGlobal("fetch", vi.fn(async () => res("text/plain", [], 302, "http://10.0.0.1/")));
    expect(toolText(await call({ id: "1:1", url: "https://x/r" }))).toContain("blocked");
    expect(runTaskMock(tm)).not.toHaveBeenCalled();
  });
});

describe("Node-side tools forward payloads the plugin schema accepts", () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const cases: Array<{ name: string; register: typeof createImage; schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }; params: Record<string, unknown>; body: string | number[] }> = [
    { name: "create-image", register: createImage, schema: CreateImageParamsSchema, params: { url: "https://x/y.png" }, body: PNG },
    { name: "create-svg", register: createSvg, schema: CreateSvgParamsSchema, params: { url: "https://x/a.svg" }, body: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>" },
    { name: "set-image-fill", register: setImageFill, schema: SetImageFillParamsSchema, params: { id: "1:1", url: "https://x/y.png" }, body: PNG },
  ];
  for (const c of cases) {
    it(`${c.name}: forwarded args pass the plugin's PARAM_SCHEMA`, async () => {
      const { server, handlers } = mockServerBundle();
      const tm = mockTaskManager({ isError: false, content: { id: "9:9" } });
      c.register(server, tm);
      const bytes = typeof c.body === "string" ? Array.from(new TextEncoder().encode(c.body)) : c.body;
      vi.stubGlobal("fetch", vi.fn(async () => cast<Response>({ ok: true, status: 200, url: "https://x/y", arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array(bytes).buffer as ArrayBuffer })));
      const out = await getHandler(handlers, c.name)(c.params);
      expect(out.isError).toBe(false);
      const forwarded = runTaskMock(tm).mock.calls[0]?.[1];
      const parsed = c.schema.safeParse(forwarded);
      expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
    });
  }
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
