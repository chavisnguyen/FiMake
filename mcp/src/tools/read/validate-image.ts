import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { z } from "zod";
import { errorResult, fetchRaster } from "../raster-format";
import { withTarget, type TargetParams } from "../target";

export const ValidateImageParamsSchema = z.object({
    url: z.string().describe("Image URL to check (same SSRF guards as create-image)"),
});

export type ValidateImageParams = z.infer<typeof ValidateImageParamsSchema>;

export interface ImageDimensions {
    width: number;
    height: number;
}

/** Read dimensions from decoded bytes without a decoder lib (PNG/GIF/JPEG). */
export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        // PNG: 8-byte signature + 4-byte length + "IHDR" + w/h BE32.
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint32(12) === 0x49484452) {
            return { width: view.getUint32(16), height: view.getUint32(20) };
        }
        return null;
    }
    if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        // GIF87a/89a: w/h LE16 at offsets 6/8.
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        return jpegDimensions(bytes);
    }
    return null;
}

/** Scan JPEG segments for the first SOFn marker carrying width/height. */
function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 2;
    while (i + 8 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1]!;
        i += 2;
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
        if (i + 1 >= bytes.length) return null;
        const len = view.getUint16(i);
        if (len < 2 || i + len > bytes.length) return null;
        // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 (not DHT/DAC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: view.getUint16(i + 3), width: view.getUint16(i + 5) };
        }
        i += len;
    }
    return null;
}

/**
 * Pre-check an image URL before create-image/set-image-fill: fetch + format
 * + dimensions, without touching Figma. Node-only (no plugin round-trip),
 * so like create-image it is network-dependent and never fixture-recorded.
 */
export function validateImage(server: McpServer, _taskManager: TaskManager) {
    server.tool(
        "validate-image",
        "Check an image URL BEFORE create-image/set-image-fill: fetches in Node (same SSRF guards), reports {ok, bytes, mime, format, width?, height?}. Use it to catch 403s, wrong formats (webp/avif/bmp), and oversized or tiny images early — with an automatic reading of pixel dimensions when the format carries them (PNG/GIF/JPEG). No Figma changes. Accepts targetFileKey/targetFileName (ignored, accepted for uniform calls); omit to broadcast.",
        withTarget(ValidateImageParamsSchema.shape),
        async (params: ValidateImageParams & TargetParams) => {
            const fetched = await fetchRaster(params.url);
            if (!fetched.ok) return errorResult(fetched.message);
            const dims = imageDimensions(fetched.bytes);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        ok: true,
                        bytes: fetched.bytes.byteLength,
                        mime: fetched.mime,
                        ...(dims ? { width: dims.width, height: dims.height } : {}),
                    }),
                }],
                isError: false,
            };
        }
    );
}
