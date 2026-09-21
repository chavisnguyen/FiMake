import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { CreateImageParamsSchema, type CreateImageParams } from "../../shared/types/index";

/** Abort a fetch that hangs (no timeout in undici by default). */
const FETCH_TIMEOUT_MS = 15000;
/** Refuse absurd payloads before they bloat the socket message (10MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (host === "localhost" || host === "metadata.google.internal" || host === "metadata.google.internal.") return true;
    if (host === "0.0.0.0" || host === "::" || host === "::ffff:127.0.0.1") return true;
    if (/^127\./.test(host) || host === "::1" || host === "[::1]") return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    if (/^fc00:/.test(host) || /^fd00:/.test(host) || /^fe80:/.test(host)) return true;
    // AWS/GCP/Azure instance metadata endpoints
    if (host === "169.254.169.254" || host === "metadata.google.internal" || host === "169.254.169.253") return true;
    return false;
}

const IMAGE_MAGIC: Array<{ offset: number; bytes: number[] }> = [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] }, // JPEG
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // WEBP (RIFF)
    { offset: 0, bytes: [0x42, 0x4d] }, // BMP
];

function hasImageMagic(buf: Uint8Array): boolean {
    return IMAGE_MAGIC.some(({ offset, bytes }) => bytes.every((b, i) => buf[offset + i] === b));
}

// Simple in-memory rate limiter: max 20 fetches per minute per process
const fetchTimestamps: number[] = [];
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
function isRateLimited(now: number = Date.now()): boolean {
    while (fetchTimestamps.length > 0 && now - fetchTimestamps[0]! > RATE_LIMIT_WINDOW_MS) {
        fetchTimestamps.shift();
    }
    if (fetchTimestamps.length >= RATE_LIMIT_MAX) return true;
    fetchTimestamps.push(now);
    return false;
}

export function createImage(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "create-image",
        "Create a image.",
        CreateImageParamsSchema.shape,
        async (params: CreateImageParams) => {
            // Fetch image in Node.js (no CORS restrictions).
            // Network failures return isError instead of throwing so MCP
            // clients always get a CallToolResult.
            let url: URL;
            try {
                url = new URL(params.url);
            } catch {
                return { content: [{ type: "text" as const, text: "Invalid image URL" }], isError: true };
            }
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return { content: [{ type: "text" as const, text: "Only http(s) image URLs are allowed" }], isError: true };
            }
            if (isBlockedHost(url.hostname)) {
                return { content: [{ type: "text" as const, text: "Image host is blocked (private/internal network)" }], isError: true };
            }
            if (isRateLimited()) {
                return { content: [{ type: "text" as const, text: "Rate limited: too many image fetches, try again shortly" }], isError: true };
            }
            let response: Response;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            try {
                response = await fetch(url, { signal: ctrl.signal, redirect: "error" });
            } catch (error) {
                const msg = error instanceof Error ? error.message : JSON.stringify(error);
                // Redirects are blocked explicitly to prevent SSRF bypass via Location header
                if (msg.includes("redirect") || msg.includes("Redirect")) {
                    return { content: [{ type: "text" as const, text: "Image redirects are not allowed (SSRF protection)" }], isError: true };
                }
                return {
                    content: [{ type: "text" as const, text: `Failed to fetch image: ${msg}` }],
                    isError: true,
                };
            } finally {
                clearTimeout(timer);
            }
            if (!response.ok) {
                return {
                    content: [{ type: "text" as const, text: `Failed to fetch image: HTTP ${response.status}` }],
                    isError: true,
                };
            }
            // Double-check final URL after any implicit redirect handling (defense-in-depth)
            try {
                const finalUrl = new URL(response.url);
                if (isBlockedHost(finalUrl.hostname)) {
                    return { content: [{ type: "text" as const, text: "Image redirect target is blocked (private/internal network)" }], isError: true };
                }
            } catch {
                // ignore parse errors
            }
            const rawHeaders = (response as unknown as { headers?: { get?: (n: string) => string | null } }).headers;
            const hasHeaders = !!rawHeaders && typeof rawHeaders.get === "function";
            const contentType = hasHeaders ? (rawHeaders.get!("content-type") ?? "").toLowerCase() : "";
            const len = hasHeaders ? Number(rawHeaders.get!("content-length") ?? 0) : 0;
            if (len > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const bytes = new Uint8Array(arrayBuffer);
            // Only enforce content-type/magic when server actually sent headers
            if (hasHeaders) {
                const isImageType = contentType.startsWith("image/");
                if (!isImageType) {
                    if (contentType && !contentType.startsWith("image/")) {
                        // Has explicit non-image type — try magic bytes as fallback, else reject
                        if (!hasImageMagic(bytes)) {
                            return { content: [{ type: "text" as const, text: `Not an image (content-type: ${contentType || "unknown"})` }], isError: true };
                        }
                    } else if (!contentType) {
                        // Missing content-type — require magic bytes
                        if (!hasImageMagic(bytes)) {
                            return { content: [{ type: "text" as const, text: "Not an image (missing content-type and no image magic bytes)" }], isError: true };
                        }
                    }
                }
            }
            const imageData = Array.from(bytes);

            // Send imageData to plugin instead of URL
            const pluginParams = {
                ...params,
                imageData,
            };

            return await safeToolProcessor(
                taskManager.runTask("create-image", pluginParams)
            );
        }
    );
}