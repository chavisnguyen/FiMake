import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { fetchGuarded } from "../fetch-guarded";
import { MAX_IMAGE_BYTES, RASTER_ACCEPT, rasterFormatError } from "../raster-format";
import { SetImageFillParamsSchema, type SetImageFillParams } from "../../shared/types/index";

function errorResult(text: string) {
    return { content: [{ type: "text" as const, text }], isError: true };
}

export function setImageFill(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "set-image-fill",
        "Use an image as the fill of an EXISTING node (frame/rectangle/…), e.g. a hero background behind text. Fetches `url` in Node (JPG/PNG/GIF, same guards as create-image); `scaleMode` FILL (default) / FIT / CROP / TILE. Use create-image instead to add a new image rectangle. Accepts targetFileKey/targetFileName (see list-clients); omit to broadcast.",
        withTarget(SetImageFillParamsSchema.shape),
        async (params: SetImageFillParams & TargetParams) => {
            const fetched = await fetchGuarded(params.url, { accept: RASTER_ACCEPT, maxBytes: MAX_IMAGE_BYTES });
            if (!fetched.ok) return errorResult(fetched.message);
            const formatError = rasterFormatError(fetched.bytes, fetched.mime, fetched.withHeaders);
            if (formatError) return errorResult(formatError);

            // url is forwarded too: the plugin validates with the same shared schema.
            const { id, url, scaleMode, targetFileKey, targetFileName } = params;
            return await safeToolProcessor(
                taskManager.runTask("set-image-fill", {
                    id,
                    url,
                    scaleMode,
                    imageData: Array.from(fetched.bytes),
                    targetFileKey,
                    targetFileName,
                })
            );
        }
    );
}
