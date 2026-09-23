import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { fetchGuarded } from "../fetch-guarded";
import { CreateImageParamsSchema, type CreateImageParams } from "../../shared/types/index";

/** Refuse absurd payloads before they bloat the socket message (10MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/**
 * Prefer Figma-decodable formats. Deliberately de-prioritizes webp: many CDNs
 * (Unsplash/imgix) content-negotiate, and figma.createImage() only supports
 * JPG/PNG/GIF — asking jpeg/png first avoids a needless "unsupported" later.
 */
const FETCH_ACCEPT = "image/png,image/jpeg,image/gif;q=0.9,image/bmp;q=0.5,*/*;q=0.1";

const FIGMA_MAGIC: Array<{ offset: number; bytes: number[] }> = [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] }, // JPEG
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF
];

function hasFigmaMagic(buf: Uint8Array): boolean {
    return FIGMA_MAGIC.some(({ offset, bytes }) => bytes.every((b, i) => buf[offset + i] === b));
}

function isWebpBytes(buf: Uint8Array): boolean {
    // RIFF....WEBP
    return (
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
    );
}

function isBmpBytes(buf: Uint8Array): boolean {
    return buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d;
}

function looksLikeSvgOrHtml(buf: Uint8Array): boolean {
    const head = Buffer.from(buf.slice(0, 512)).toString("utf-8").trimStart().toLowerCase();
    return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype html") || head.startsWith("<html");
}

function unsupportedFormatMessage(buf: Uint8Array, contentType: string): string {
    if (isWebpBytes(buf) || contentType.includes("webp") || contentType.includes("avif")) {
        return `Image format (${contentType || "webp/avif"}) is not supported by Figma — only JPG/PNG/GIF. Try a direct .jpg/.png URL (e.g. Unsplash/imgix with ?fm=jpg)`;
    }
    if (isBmpBytes(buf) || contentType.includes("bmp")) {
        return "Image format (bmp) is not supported by Figma — only JPG/PNG/GIF. Use a .jpg/.png URL";
    }
    if (looksLikeSvgOrHtml(buf) || contentType.includes("svg")) {
        return `Not a decodable image (content-type: ${contentType || "unknown"}). SVG/HTML cannot be used with create-image — use a direct .jpg/.png/.gif URL`;
    }
    return `Unsupported image format (content-type: ${contentType || "unknown"}) — Figma only decodes JPG/PNG/GIF`;
}

export function createImage(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "create-image",
        "Create an image from an http(s) URL (follows up to 5 redirects, Figma decodes JPG/PNG/GIF only). Accepts targetFileKey/targetFileName to draw into one open file (see list-clients); omit to broadcast.",
        withTarget(CreateImageParamsSchema.shape),
        async (params: CreateImageParams & TargetParams) => {
            // Fetch image in Node.js (no CORS restrictions). Failures return
            // isError instead of throwing so MCP clients always get a CallToolResult.
            const fetched = await fetchGuarded(params.url, { accept: FETCH_ACCEPT, maxBytes: MAX_IMAGE_BYTES });
            if (!fetched.ok) {
                return { content: [{ type: "text" as const, text: fetched.message }], isError: true };
            }
            const { bytes, mime, withHeaders } = fetched;
            // Only enforce content-type/magic when server actually sent headers
            // (unit mocks often omit headers — keep that path lenient).
            if (withHeaders && !hasFigmaMagic(bytes)) {
                // Explicit non-image (text/html, application/octet-stream...) gets a terse message;
                // image/* (webp/svg/avif/bmp...) or missing content-type gets actionable guidance.
                const text = mime && !mime.startsWith("image/")
                    ? `Not an image (content-type: ${mime})`
                    : unsupportedFormatMessage(bytes, mime);
                return { content: [{ type: "text" as const, text }], isError: true };
            }

            // Send imageData to plugin instead of URL
            const pluginParams = {
                ...params,
                imageData: Array.from(bytes),
            };

            return await safeToolProcessor(
                taskManager.runTask("create-image", pluginParams)
            );
        }
    );
}
