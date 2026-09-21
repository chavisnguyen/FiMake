import * as fs from "node:fs/promises";
import * as path from "path";
import type { TaskManager, TaskResult } from "../../bridge/task-manager";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ExportFileParamsSchema, type ExportFileParams } from "../../shared/types/index";

interface PageStubNode {
    id: string;
    name: string;
    type: string;
}

interface PageStub {
    id: string;
    name: string;
    nodes: PageStubNode[];
}

function sanitizeFileName(name: string): string {
    const cleaned = name.replace(/[\/\\:*?"<>|\0]/g, "_").trim().slice(0, 100);
    return cleaned.length > 0 ? cleaned : "unnamed";
}

/** Max top-level frames per export (bounds disk writes from a runaway file). */
export const MAX_EXPORT_FRAMES = 500;

/** Max parallel get-node-info calls (bounds plugin pressure). */
const EXPORT_CONCURRENCY = 4;

function safeParsePage(rawPage: unknown): PageStub | null {
    if (typeof rawPage === "string") {
        try {
            return JSON.parse(rawPage) as PageStub;
        } catch {
            return null;
        }
    }
    if (typeof rawPage === "object" && rawPage !== null) return rawPage as PageStub;
    return null;
}

export function resolveExportDir(outputDirParam: string | undefined): string {
    const outputDir = path.resolve(
        outputDirParam ?? path.join(process.cwd(), "exports", `export-${Date.now()}`)
    );
    if (outputDir.includes("\0")) throw new Error("Invalid outputDir");
    const root = path.parse(outputDir).root;
    if (outputDir === root) throw new Error("Refusing to export into filesystem root");
    return outputDir;
}

/** Assert a derived file stays inside outputDir (blocks ../ via node names). */
export function assertInsideDir(dir: string, file: string): void {
    const rel = path.relative(dir, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Refusing to write outside outputDir: ${file}`);
    }
}

/** Whether a get-node-info payload was cut by the maxNodes/maxChars budget. */
function isTruncated(body: unknown): boolean {
    return (
        typeof body === "object" &&
        body !== null &&
        "_truncatedCount" in body &&
        !!body._truncatedCount
    );
}

// Exports the whole file (every page, every top-level frame) to local JSON
// files instead of returning it all inline. Reuses the existing get-pages /
// get-node-info plugin commands as-is -- this tool only adds a Node-side
// (fs-capable) fan-out + writer on top of them, since the plugin itself runs
// sandboxed with no filesystem access.
export function exportFile(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "export-file",
        "Export the ENTIRE current Figma file (all pages, all top-level frames) to local JSON files on disk, instead of returning it all inline (which would blow past response size limits for anything but a trivial file). Writes one JSON file per top-level frame/node plus a manifest.json index (page, node id/name, file path, byte size, whether it was truncated by maxNodes/maxChars). Returns only that manifest summary -- read the individual per-frame files afterward (via the manifest paths) for full detail, and re-request via get-node-info for any file flagged as truncated.",
        ExportFileParamsSchema.shape,
        async (params: ExportFileParams) => {
            try {
                const outputDir = resolveExportDir(params.outputDir);
                await fs.mkdir(outputDir, { recursive: true });

                const pagesResult = (await taskManager.runTask("get-pages", {})) as TaskResult;
                if (pagesResult.isError) {
                    return {
                        content: [{ type: "text", text: JSON.stringify(pagesResult.content) }],
                        isError: true,
                    };
                }

                const rawPages = pagesResult.content as unknown[];
                const manifest: Array<{
                    page: string;
                    nodeId: string;
                    nodeName: string;
                    type: string;
                    file: string;
                    bytes: number;
                    truncated: boolean;
                }> = [];

                const jobs: Array<{ page: PageStub; nodeStub: PageStubNode }> = [];
                for (const rawPage of rawPages) {
                    const page = safeParsePage(rawPage);
                    if (!page || !Array.isArray(page.nodes)) continue;
                    for (const nodeStub of page.nodes) jobs.push({ page, nodeStub });
                }
                if (jobs.length > MAX_EXPORT_FRAMES) {
                    throw new Error(`Export exceeds ${MAX_EXPORT_FRAMES} frames; narrow the file or raise the limit in code.`);
                }

                // Deduplicate sanitized page dir names by appending page id on collision
                const pageDirById = new Map<string, string>();
                const usedDirNames = new Map<string, string>(); // sanitized -> pageId that owns it
                for (const { page } of jobs) {
                    if (pageDirById.has(page.id)) continue;
                    const base = sanitizeFileName(page.name);
                    const owner = usedDirNames.get(base);
                    if (owner === undefined) {
                        usedDirNames.set(base, page.id);
                        pageDirById.set(page.id, path.join(outputDir, base));
                    } else if (owner !== page.id) {
                        // Collision: disambiguate with page id suffix
                        const disambiguated = `${base}-${page.id.replace(/[:]/g, "_")}`;
                        pageDirById.set(page.id, path.join(outputDir, disambiguated));
                    }
                }

                const pageDirs = new Set<string>();
                for (let i = 0; i < jobs.length; i += EXPORT_CONCURRENCY) {
                    const batch = jobs.slice(i, i + EXPORT_CONCURRENCY);
                    const results = await Promise.all(
                        batch.map(async ({ page, nodeStub }) => {
                            const nodeResult = (await taskManager.runTask("get-node-info", {
                                id: nodeStub.id,
                                depth: -1,
                                maxNodes: params.maxNodes ?? 5000,
                                maxChars: params.maxChars ?? 35000,
                            })) as TaskResult;

                            const pageDir = pageDirById.get(page.id) ?? path.join(outputDir, sanitizeFileName(page.name));
                            assertInsideDir(outputDir, pageDir);
                            const fileName = `${sanitizeFileName(nodeStub.name)}-${nodeStub.id.replace(/[:]/g, "_")}.json`;
                            const filePath = path.join(pageDir, fileName);
                            assertInsideDir(outputDir, filePath);
                            const body = nodeResult.isError ? { error: nodeResult.content } : nodeResult.content;
                            return { page, nodeStub, nodeResult, body, pageDir, filePath };
                        })
                    );
                    for (const { page, nodeStub, nodeResult, body, pageDir, filePath } of results) {
                        if (!pageDirs.has(pageDir)) {
                            await fs.mkdir(pageDir, { recursive: true });
                            pageDirs.add(pageDir);
                        }
                        const json = JSON.stringify(body, null, 2);
                        await fs.writeFile(filePath, json, "utf-8");

                        manifest.push({
                            page: page.name,
                            nodeId: nodeStub.id,
                            nodeName: nodeStub.name,
                            type: nodeStub.type,
                            file: path.relative(outputDir, filePath),
                            bytes: Buffer.byteLength(json, "utf-8"),
                            truncated: !nodeResult.isError && isTruncated(body),
                        });
                    }
                }

                const manifestPath = path.join(outputDir, "manifest.json");
                await fs.writeFile(
                    manifestPath,
                    JSON.stringify(
                        {
                            outputDir,
                            generatedAt: new Date().toISOString(),
                            fileCount: manifest.length,
                            files: manifest,
                        },
                        null,
                        2
                    ),
                    "utf-8"
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                outputDir,
                                manifest: manifestPath,
                                fileCount: manifest.length,
                                truncatedFiles: manifest.filter((m) => m.truncated).map((m) => m.file),
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
