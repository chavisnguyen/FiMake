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
    if (host === "localhost" || host === "metadata.google.internal") return true;
    if (/^127\./.test(host) || host === "::1" || host === "[::1]") return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
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
            let response: Response;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
            try {
                response = await fetch(url, { signal: ctrl.signal });
            } catch (error) {
                return {
                    content: [{ type: "text" as const, text: `Failed to fetch image: ${error instanceof Error ? error.message : JSON.stringify(error)}` }],
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
            const headers = (response as unknown as { headers?: { get?: (n: string) => string | null } }).headers;
            const contentType = headers?.get?.("content-type") ?? "";
            if (contentType && !contentType.startsWith("image/")) {
                return { content: [{ type: "text" as const, text: `Not an image (content-type: ${contentType})` }], isError: true };
            }
            const len = Number(headers?.get?.("content-length") ?? 0);
            if (len > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
                return { content: [{ type: "text" as const, text: `Image exceeds ${MAX_IMAGE_BYTES} bytes` }], isError: true };
            }
            const imageData = Array.from(new Uint8Array(arrayBuffer));

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