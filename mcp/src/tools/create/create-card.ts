import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskManager, TaskResult } from "../../bridge/task-manager";
import { errorResult, fetchRaster } from "../raster-format";
import { withTarget, type TargetParams } from "../target";
import { CreateCardParamsSchema, type CreateCardParams } from "../../shared/types/index";

interface CreatedEntry {
    index: number;
    op: string;
    ref?: string;
    id?: string;
}

/**
 * One-call product card: frame (auto-layout, hug) + title + optional
 * meta/price/button + optional header image. Fans out over batch-create
 * (atomic) plus one create-image — no new plugin command, so the whole
 * card is ~2 round trips instead of ~12 one-by-one tool calls.
 */
export function createCard(server: McpServer, taskManager: TaskManager) {
    server.tool(
        "create-card",
        "Build a product card in ONE call: auto-layout frame (height hugs content) with title + optional meta/price/button + optional header image. Cheaper and more consistent than ~12 separate create/set calls. Returns {cardId, titleId, buttonId?, imageId?}. Omit imageUrl to skip the network fetch.",
        withTarget(CreateCardParamsSchema.shape),
        async (params: CreateCardParams & TargetParams) => {
            const { targetFileKey, targetFileName, ...card } = params;
            const target = { ...(targetFileKey ? { targetFileKey } : {}), ...(targetFileName ? { targetFileName } : {}) };
            try {
                const operations: Array<{ op: string; ref?: string; params: Record<string, unknown> }> = [
                    { op: "create-frame", ref: "card", params: { x: card.x, y: card.y, width: card.width, height: 10, name: card.name, ...(card.parentId ? { parentId: card.parentId } : {}) } },
                    {
                        op: "set-layout", params: {
                            id: "$card", mode: "VERTICAL", layoutSizingVertical: "HUG",
                            paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16, itemSpacing: 12,
                        },
                    },
                    { op: "set-fill-color", params: { id: "$card", color: card.background } },
                    { op: "set-corner-radius", params: { id: "$card", cornerRadius: card.radius } },
                    {
                        op: "create-text", ref: "title",
                        params: { x: 0, y: 0, text: card.title, fontSize: card.titleSize, fontWeight: 700, name: "Title", parentId: "$card" },
                    },
                ];
                if (card.meta) {
                    operations.push({
                        op: "create-text",
                        params: { x: 0, y: 0, text: card.meta, fontSize: 13, fontColor: "#6B7280FF", name: "Meta", parentId: "$card" },
                    });
                }
                if (card.price) {
                    operations.push({
                        op: "create-text",
                        params: { x: 0, y: 0, text: card.price, fontSize: 16, fontWeight: 700, name: "Price", parentId: "$card" },
                    });
                }
                if (card.buttonLabel) {
                    operations.push(
                        { op: "create-frame", ref: "btn", params: { x: 0, y: 0, width: 10, height: 10, name: "Button", parentId: "$card" } },
                        {
                            op: "set-layout", params: {
                                id: "$btn", mode: "HORIZONTAL", layoutSizingHorizontal: "FILL", layoutSizingVertical: "HUG",
                                paddingTop: 12, paddingBottom: 12, paddingLeft: 24, paddingRight: 24,
                                primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
                            },
                        },
                        { op: "set-fill-color", params: { id: "$btn", color: card.buttonColor } },
                        { op: "set-corner-radius", params: { id: "$btn", cornerRadius: 12 } },
                        {
                            op: "create-text", ref: "buttonLabel",
                            params: { x: 0, y: 0, text: card.buttonLabel, fontSize: 14, fontWeight: 600, fontColor: "#FFFFFFFF", textAlign: "CENTER", name: "Button label", parentId: "$btn" },
                        },
                    );
                }
                const batch = (await taskManager.runTask("batch-create", { operations, atomic: true, ...target })) as TaskResult;
                if (batch.isError) {
                    return {
                        content: [{ type: "text", text: JSON.stringify(batch.content) }],
                        isError: true,
                    };
                }
                const created = ((batch.content as { created?: CreatedEntry[] }).created ?? []);
                const byRef = (ref: string): string | undefined => created.find((c) => c.ref === ref)?.id;
                const cardId = byRef("card");
                if (!cardId) throw new Error("batch-create returned no card id");
                let imageId: string | undefined;
                if (card.imageUrl) {
                    const fetched = await fetchRaster(card.imageUrl);
                    if (!fetched.ok) return errorResult(`Card built, but the header image failed: ${fetched.message} (card: ${cardId})`);
                    const img = (await taskManager.runTask("create-image", {
                        x: 0, y: 0, width: card.width, height: card.imageHeight, name: "Header image",
                        url: card.imageUrl, imageData: Buffer.from(fetched.bytes).toString("base64"),
                        parentId: cardId, ...target,
                    })) as TaskResult;
                    if (img.isError) {
                        return {
                            content: [{ type: "text", text: JSON.stringify({ cardId, warning: img.content }) }],
                            isError: true,
                        };
                    }
                    imageId = (img.content as { id?: string }).id;
                    if (imageId) {
                        await taskManager.runTask("set-parent-id", { id: imageId, parentId: cardId, index: 0, ...target });
                    }
                }
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            cardId,
                            titleId: byRef("title"),
                            ...(byRef("buttonLabel") ? { buttonId: byRef("btn"), buttonLabelId: byRef("buttonLabel") } : {}),
                            ...(imageId ? { imageId } : {}),
                        }),
                    }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: error instanceof Error ? error.message : JSON.stringify(error) }],
                    isError: true,
                };
            }
        }
    );
}
