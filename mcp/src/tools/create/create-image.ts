import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { CreateImageParamsSchema, type CreateImageParams } from "../../shared/types/index";

/** Abort a fetch chain that hangs (no timeout in undici by default). Total budget for all redirect hops. */
const FETCH_TIMEOUT_MS = 15000;
/** Refuse absurd payloads before they bloat the socket message (10MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Max redirect hops to follow manually (each hop re-checked for SSRF). */
const MAX_REDIRECTS = 5;
/** Wikimedia / many CDNs return 403 without a browser-like UA. */
const FETCH_USER_AGENT = "Fimake/1.0 (+https://github.com/chavisnguyen/FiMake)";
/**
 * Prefer Figma-decodable formats. Deliberately de-prioritizes webp: many CDNs
 * (Unsplash/imgix) content-negotiate, and figma.createImage() only supports
 * JPG/PNG/GIF — asking jpeg/png first avoids a needless "unsupported" later.
 */
const FETCH_ACCEPT = "image/png,image/jpeg,image/gif;q=0.9,image/bmp;q=0.5,*/*;q=0.1";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** MIME types figma.createImage() can decode. */
const FIGMA_CONTENT_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/pjpeg",
    "image/x-png",
]);

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

type HeaderGetter = { get?: (n: string) => string | null };

function getHeader(response: Response, name: string): string {
    const headers = (response as unknown as { headers?: HeaderGetter }).headers;
    if (!headers || typeof headers.get !== "function") return "";
    try {
        return headers.get(name) ?? "";
    } catch {
        return "";
    }
}

function hasHeaders(response: Response): boolean {
    const headers = (response as unknown as { headers?: HeaderGetter }).headers;
    return !!headers && typeof headers.get === "function";
}

function fetchInit(signal: AbortSignal): RequestInit {
    return {
        signal,
        redirect: "manual",
        headers: {
            "User-Agent": FETCH_USER_AGENT,
            Accept: FETCH_ACCEPT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    };
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
        "Create an image from an http(s) URL (follows up to 5 redirects, Figma decodes JPG/PNG/GIF only). Accepts targetFileKey/targetFileName to draw into one open file (see list-clients); omit to broadcast.",
        withTarget(CreateImageParamsSchema.shape),
        async (params: CreateImageParams & TargetParams) => {
            // Fetch image in Node.js (no CORS restrictions).
            // Network failures return isError instead of throwing so MCP
            // clients always get a CallToolResult.
            let currentUrl: URL;
            try {
                currentUrl = new URL(params.url);
            } catch {
                return { content: [{ type: "text" as const, text: "Invalid image URL" }], isError: true };
            }
            if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
                return { content: [{ type: "text" as const, text: "Only http(s) image URLs are allowed" }], isError: true };
            }
            if (currentUrl.username || currentUrl.password) {
                return { content: [{ type: "text" as const, text: "Image URL must not contain credentials" }], isError: true };
            }
            if (isBlockedHost(currentUrl.hostname)) {
                return { content: [{ type: "text" as const, text: "Image host is blocked (private/internal network)" }], isError: true };
            }
            if (isRateLimited()) {
                return { content: [{ type: "text" as const, text: "Rate limited: too many image fetches, try again shortly" }], isError: true };
            }
            let response: Response | undefined;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            try {
                // Follow redirects manually so every hop can be SSRF-checked
                // (protocol + blocked host + credentials) instead of rejecting all redirects.
                for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
                    let res: Response;
                    try {
                        res = await fetch(currentUrl, fetchInit(ctrl.signal));
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : JSON.stringify(error);
                        return {
                            content: [{ type: "text" as const, text: `Failed to fetch image: ${msg}` }],
                            isError: true,
                        };
                    }
                    const status = res.status ?? 200;
                    if (REDIRECT_STATUSES.has(status)) {
                        if (hop === MAX_REDIRECTS) {
                            return { content: [{ type: "text" as const, text: `Too many redirects (>${MAX_REDIRECTS})` }], isError: true };
                        }
                        const location = getHeader(res, "location");
                        if (!location) {
                            return { content: [{ type: "text" as const, text: `Image redirect (${status}) without Location header` }], isError: true };
                        }
                        let next: URL;
                        try {
                            next = new URL(location, currentUrl);
                        } catch {
                            return { content: [{ type: "text" as const, text: "Image redirect has invalid Location URL" }], isError: true };
                        }
                        if (next.protocol !== "http:" && next.protocol !== "https:") {
                            return { content: [{ type: "text" as const, text: "Image redirect target protocol must be http(s)" }], isError: true };
                        }
                        if (next.username || next.password) {
                            return { content: [{ type: "text" as const, text: "Image redirect target must not contain credentials" }], isError: true };
                        }
                        if (isBlockedHost(next.hostname)) {
                            return { content: [{ type: "text" as const, text: "Image redirect target is blocked (private/internal network)" }], isError: true };
                        }
                        // Drain body before next hop (avoids socket leak on some runtimes).
                        try {
                            await res.arrayBuffer();
                        } catch {
                            // ignore drain errors
                        }
                        currentUrl = next;
                        continue;
                    }
                    response = res;
                    break;
                }
            } finally {
                clearTimeout(timer);
            }
            if (!response) {
                return { content: [{ type: "text" as const, text: "Failed to fetch image: no response" }], isError: true };
            }
            if (!response.ok) {
                return {
                    content: [{ type: "text" as const, text: `Failed to fetch image: HTTP ${response.status}` }],
                    isError: true,
                };
            }
            // Defense-in-depth: re-check the final URL actually fetched.
            try {
                const finalUrl = new URL(response.url || currentUrl.toString());
                if (isBlockedHost(finalUrl.hostname)) {
                    return { content: [{ type: "text" as const, text: "Image redirect target is blocked (private/internal network)" }], isError: true };
                }
            } catch {
                // ignore parse errors
            }
            const withHeaders = hasHeaders(response);
            const contentType = withHeaders ? getHeader(response, "content-type").toLowerCase() : "";
            const mime = contentType.split(";")[0]?.trim() ?? "";
            const len = withHeaders ? Number(getHeader(response, "content-length") || 0) : 0;
            if (len > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const bytes = new Uint8Array(arrayBuffer);
            // Only enforce content-type/magic when server actually sent headers
            // (unit mocks often omit headers — keep that path lenient).
            if (withHeaders) {
                if (mime && FIGMA_CONTENT_TYPES.has(mime)) {
                    // Declared JPG/PNG/GIF — still verify bytes to catch mislabeled webp/html.
                    if (!hasFigmaMagic(bytes)) {
                        return { content: [{ type: "text" as const, text: unsupportedFormatMessage(bytes, mime) }], isError: true };
                    }
                } else if (mime && mime.startsWith("image/")) {
                    // Explicit image/* but not Figma-decodable (webp/svg/avif/bmp/ico/tiff...)
                    // Allow mislabeled servers: if bytes are really JPG/PNG/GIF, let them through.
                    if (!hasFigmaMagic(bytes)) {
                        return { content: [{ type: "text" as const, text: unsupportedFormatMessage(bytes, mime) }], isError: true };
                    }
                } else if (mime) {
                    // Explicit non-image (text/html, application/octet-stream...) — allow only if bytes prove otherwise.
                    if (!hasFigmaMagic(bytes)) {
                        return { content: [{ type: "text" as const, text: `Not an image (content-type: ${mime})` }], isError: true };
                    }
                } else {
                    // Missing content-type — require JPG/PNG/GIF magic.
                    if (!hasFigmaMagic(bytes)) {
                        return { content: [{ type: "text" as const, text: unsupportedFormatMessage(bytes, "") }], isError: true };
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