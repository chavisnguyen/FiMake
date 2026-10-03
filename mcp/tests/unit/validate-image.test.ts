import { describe, it, expect, vi, afterEach } from "vitest";
import { imageDimensions } from "../../src/tools/read/validate-image";
import { validateImage } from "../../src/tools/read/validate-image";
import { resetFetchRateLimit } from "../../src/tools/fetch-guarded";

describe("imageDimensions", () => {
  it("reads PNG dimensions from IHDR", () => {
    // 1x1 transparent PNG.
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ));
    expect(imageDimensions(png)).toEqual({ width: 1, height: 1 });
  });

  it("reads GIF dimensions from the header", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00]);
    expect(imageDimensions(gif)).toEqual({ width: 16, height: 32 });
  });

  it("reads JPEG dimensions from SOF0", () => {
    // SOI + SOF0 (length 8: precision + h + w + 1 component) — minimal synthetic frame.
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01]);
    expect(imageDimensions(jpg)).toEqual({ width: 3, height: 2 });
  });

  it("returns null for unknown/truncated bytes", () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageDimensions(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("validate-image tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFetchRateLimit();
  });

  it("reports ok + dimensions for a PNG URL", async () => {
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://x/a.png",
      headers: new Headers({ "content-type": "image/png", "content-length": String(png.byteLength) }),
      arrayBuffer: async () => png.buffer as ArrayBuffer,
    })));
    const calls: Array<{ name: string; desc: string; shape: unknown; handler: (p: never) => Promise<never> }> = [];
    const server = { tool: (name: string, desc: string, shape: unknown, handler: (p: never) => Promise<never>) => { calls.push({ name, desc, shape, handler }); } };
    validateImage(server as never, {} as never);
    const res = await calls[0]!.handler({ url: "https://x/a.png" } as never) as {
      content: Array<{ text: string }>; isError: boolean;
    };
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({ ok: true, mime: "image/png", width: 1, height: 1 });
  });

  it("reports fetch failures as errors without touching Figma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, url: "https://x/a.png", headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) })));
    const calls: Array<{ handler: (p: never) => Promise<never> }> = [];
    const server = { tool: (_n: string, _d: string, _s: unknown, handler: (p: never) => Promise<never>) => { calls.push({ handler }); } };
    validateImage(server as never, {} as never);
    const res = await calls[0]!.handler({ url: "https://x/a.png" } as never) as { isError: boolean };
    expect(res.isError).toBe(true);
  });
});
