import * as fs from "node:fs/promises";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager, TaskResult } from "../../bridge/task-manager";
import { ExportAssetParamsSchema, type ExportAssetParams } from "../../shared/types/index";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";

/** Max decoded asset bytes accepted before writing to disk (20MB). */
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export function resolveAssetPath(outputPath: string): string {
    if (outputPath.includes("\0")) throw new Error("Invalid outputPath");
    const resolved = path.resolve(outputPath);
    const root = path.parse(resolved).root;
    if (resolved === root) throw new Error("Refusing to write to filesystem root");
    return resolved;
}

export function exportAsset(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "export-asset",
        "Export a node as a real rendered asset instead of reconstructing it by hand. Use this for icons, illustrations, logos and other vector graphics so the output matches the design exactly — get-node-info deliberately omits vector path data, so hand-drawn SVGs from its bounding boxes will drift from the real shape. `format`: \"SVG\" (default) returns ready-to-use SVG markup with real path data. \"PNG\"/\"JPG\" return a base64-encoded raster image, sized by `scale` (default 1, max 4). Without `outputPath`, returns `{ id, name, format, mimeType, data }` inline where `data` is raw SVG markup for SVG, or base64 for PNG/JPG. With `outputPath`, writes the asset straight to that file instead and returns `{ path, bytes }`. Accepts targetFileKey/targetFileName to export from one open file (see list-clients); omit to broadcast.",
        withTarget(ExportAssetParamsSchema.shape),
        async (params: ExportAssetParams & TargetParams) => {
            const { outputPath, ...taskParams } = params;

            if (!outputPath) {
                return await safeToolProcessor(
                    taskManager.runTask("export-asset", taskParams)
                );
            }

            try {
                const result = (await taskManager.runTask("export-asset", taskParams)) as TaskResult;
                if (result.isError) {
                    return {
                        content: [{ type: "text", text: JSON.stringify(result.content) }],
                        isError: true,
                    };
                }

                const asset = result.content as { format?: string; data: string };
                if (typeof asset.data !== "string") throw new Error("Plugin returned non-string asset data");
                const resolvedPath = resolveAssetPath(outputPath);
                await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

                const isRaster = asset.format === "PNG" || asset.format === "JPG";
                if (isRaster) {
                    const buf = Buffer.from(asset.data, "base64");
                    if (buf.byteLength > MAX_ASSET_BYTES) {
                        throw new Error(`Asset exceeds ${MAX_ASSET_BYTES} bytes; omit outputPath to stream inline instead.`);
                    }
                    await fs.writeFile(resolvedPath, buf);
                } else {
                    if (Buffer.byteLength(asset.data, "utf-8") > MAX_ASSET_BYTES) {
                        throw new Error(`Asset exceeds ${MAX_ASSET_BYTES} bytes; omit outputPath to stream inline instead.`);
                    }
                    await fs.writeFile(resolvedPath, asset.data, "utf-8");
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                path: resolvedPath,
                                bytes: (await fs.stat(resolvedPath)).size,
                            }),
                        },
                    ],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: error instanceof Error ? error.message : JSON.stringify(error),
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
