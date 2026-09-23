import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { fetchGuarded } from "../fetch-guarded";
import { MAX_IMAGE_BYTES, RASTER_ACCEPT, rasterFormatError } from "../raster-format";
import { CreateImageParamsSchema, type CreateImageParams } from "../../shared/types/index";

export function createImage(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "create-image",
        "Create an image from an http(s) URL (follows up to 5 redirects, Figma decodes JPG/PNG/GIF only). Accepts targetFileKey/targetFileName to draw into one open file (see list-clients); omit to broadcast.",
        withTarget(CreateImageParamsSchema.shape),
        async (params: CreateImageParams & TargetParams) => {
            // Fetch image in Node.js (no CORS restrictions). Failures return
            // isError instead of throwing so MCP clients always get a CallToolResult.
            const fetched = await fetchGuarded(params.url, { accept: RASTER_ACCEPT, maxBytes: MAX_IMAGE_BYTES });
            if (!fetched.ok) {
                return { content: [{ type: "text" as const, text: fetched.message }], isError: true };
            }
            const formatError = rasterFormatError(fetched.bytes, fetched.mime, fetched.withHeaders);
            if (formatError) {
                return { content: [{ type: "text" as const, text: formatError }], isError: true };
            }

            // Send imageData to plugin instead of URL
            const pluginParams = {
                ...params,
                imageData: Array.from(fetched.bytes),
            };

            return await safeToolProcessor(
                taskManager.runTask("create-image", pluginParams)
            );
        }
    );
}
