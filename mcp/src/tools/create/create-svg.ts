import * as fs from "fs/promises";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager } from "../../bridge/task-manager";
import { safeToolProcessor } from "../safe-tool-processor";
import { withTarget, type TargetParams } from "../target";
import { fetchGuarded } from "../fetch-guarded";
import { resolveAssetPath } from "../read/export-asset";
import { CreateSvgParamsSchema, type CreateSvgParams } from "../../shared/types/index";

/** Same socket path as create-image; kept lower since createNodeFromSvg parses synchronously. */
export const MAX_SVG_BYTES = 5 * 1024 * 1024;
const SVG_ACCEPT = "image/svg+xml,text/plain;q=0.5,*/*;q=0.1";
/** Optional XML prolog / comments / DOCTYPE, then the <svg> root. */
const SVG_START = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i;

/** Returns an error message, or null when `svg` is acceptable. */
export function validateSvg(svg: string): string | null {
    if (Buffer.byteLength(svg, "utf-8") > MAX_SVG_BYTES) return `SVG exceeds ${MAX_SVG_BYTES} bytes`;
    if (/<!ENTITY/i.test(svg)) return "SVG must not declare XML entities (<!ENTITY)";
    if (!SVG_START.test(svg)) return "Not an SVG: content must start with <svg (optionally after <?xml, comments or DOCTYPE)";
    return null;
}

async function readSvgFile(filePath: string): Promise<string> {
    const resolved = resolveAssetPath(filePath);
    if (path.extname(resolved).toLowerCase() !== ".svg") throw new Error("filePath must point to a .svg file");
    const stat = await fs.stat(resolved);
    if (stat.size > MAX_SVG_BYTES) throw new Error(`SVG exceeds ${MAX_SVG_BYTES} bytes`);
    return await fs.readFile(resolved, "utf-8");
}

function errorResult(text: string) {
    return { content: [{ type: "text" as const, text }], isError: true };
}

export function createSvg(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "create-svg",
        "Create an editable vector node from SVG. Provide exactly one of: `svg` (inline markup), `url` (http(s) .svg, fetched in Node), `filePath` (local .svg, read in Node). Preserves intrinsic SVG size (no resize); use x/y/parentId to place. Prefer over create-image when you need editable vectors; use create-image for JPG/PNG/GIF photos. Max 5MB. Accepts targetFileKey/targetFileName to draw into one open file (see list-clients); omit to broadcast.",
        withTarget(CreateSvgParamsSchema.shape),
        async (params: CreateSvgParams & TargetParams) => {
            const sources = [params.svg, params.url, params.filePath].filter((v) => typeof v === "string" && v.length > 0);
            if (sources.length !== 1) return errorResult("Provide exactly one of svg, url, filePath");

            let svg: string;
            if (params.svg) {
                svg = params.svg;
            } else if (params.url) {
                const fetched = await fetchGuarded(params.url, { accept: SVG_ACCEPT, maxBytes: MAX_SVG_BYTES });
                if (!fetched.ok) return errorResult(fetched.message);
                svg = Buffer.from(fetched.bytes).toString("utf-8");
            } else {
                try {
                    svg = await readSvgFile(params.filePath as string);
                } catch (error) {
                    return errorResult(`Failed to read SVG file: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            const invalid = validateSvg(svg);
            if (invalid) return errorResult(invalid);

            const { name, x, y, parentId, targetFileKey, targetFileName } = params;
            return await safeToolProcessor(
                taskManager.runTask("create-svg", { svg, name, x, y, parentId, targetFileKey, targetFileName })
            );
        }
    );
}
