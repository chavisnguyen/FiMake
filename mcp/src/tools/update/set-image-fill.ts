import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { errorResult, fetchRaster } from "../raster-format";
import { SetImageFillParamsSchema, type SetImageFillParams } from "../../shared/types/index";

export function setImageFill(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "set-image-fill",
        "Use an image as the fill of an EXISTING node (frame/rectangle/…), e.g. a hero background behind text. Fetches `url` in Node (JPG/PNG/GIF, same guards as create-image); `scaleMode` FILL (default) / FIT / CROP / TILE. Use create-image instead to add a new image rectangle. Accepts targetFileKey/targetFileName (see list-clients); omit to broadcast.",
        withTarget(SetImageFillParamsSchema.shape),
        async (params: SetImageFillParams & TargetParams) => {
            const fetched = await fetchRaster(params.url);
            if (!fetched.ok) return errorResult(fetched.message);

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
