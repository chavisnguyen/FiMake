import { GetDesignAuditInput } from "@shared/types";
import { ToolResult } from "../tool-result";
import { contrastRatio } from "utils/contrast";

export interface AuditIssue {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    check: string;
    detail: string;
}

/** Figma's default layer names ("Rectangle 12") — renaming helps everyone. */
const DEFAULT_NAME = /^(Rectangle|Ellipse|Frame|Text|Group|Component|Instance|Vector|Line|Star|Polygon|Slice|Section|Stamp|Connector|Boolean operation)\s+\d+$/i;

/** Nodes worth scanning (bounded so huge files can't hang the plugin). */
const MAX_SCAN_NODES = 2000;

interface SolidFill {
    r: number;
    g: number;
    b: number;
}

function solidFillOf(node: SceneNode): SolidFill | null {
    if (!("fills" in node)) return null;
    const fills = node.fills;
    if (!Array.isArray(fills)) return null; // figma.mixed — per-segment, skip
    const paint = fills.find((p): p is SolidPaint => p.type === "SOLID" && p.visible !== false);
    if (!paint) return null;
    const opacity = paint.opacity ?? 1;
    return { r: paint.color.r * opacity, g: paint.color.g * opacity, b: paint.color.b * opacity };
}

function hasSize(node: SceneNode): node is SceneNode & { width: number; height: number } {
    return typeof (node as { width?: unknown }).width === "number" && typeof (node as { height?: unknown }).height === "number";
}

/**
 * Cheap static audit of a subtree: empty texts, zero-area nodes, default
 * layer names, hidden layers, and low-contrast text vs the nearest solid
 * ancestor background. Heuristic, not a renderer — contrast uses the first
 * solid ancestor fill (gradients/images/overlays are skipped, not guessed).
 */
export async function getDesignAudit(args: GetDesignAuditInput): Promise<ToolResult> {
    const root = await figma.getNodeByIdAsync(args.id);
    if (!root) {
        return { isError: true, content: "Node not found" };
    }
    const issues: AuditIssue[] = [];
    const maxIssues = args.maxIssues ?? 50;
    let scanned = 0;
    const push = (node: SceneNode, check: string, detail: string): void => {
        if (issues.length >= maxIssues) return;
        issues.push({ nodeId: node.id, nodeName: node.name, nodeType: node.type, check, detail });
    };

    const visit = (node: SceneNode, ancestors: SceneNode[]): void => {
        if (scanned >= MAX_SCAN_NODES) return;
        scanned += 1;
        if (node.visible === false) {
            push(node, "hidden", "Layer is hidden (visible=false) — delete it or turn it on.");
        }
        if (hasSize(node) && (node.width <= 0 || node.height <= 0)) {
            push(node, "zero-size", `Box is ${node.width}x${node.height} — invisible at runtime.`);
        }
        if (DEFAULT_NAME.test(node.name)) {
            push(node, "default-name", `Rename "${node.name}" to what it is (helps find-nodes-by-name later).`);
        }
        if (node.type === "TEXT") {
            const text = node as TextNode;
            if (text.characters.length === 0) {
                push(node, "empty-text", "Text layer has no characters — delete it or fill it in.");
            } else {
                const fg = solidFillOf(text);
                if (fg) {
                    for (let i = ancestors.length - 1; i >= 0; i--) {
                        const bg = solidFillOf(ancestors[i]!);
                        if (bg) {
                            const ratio = contrastRatio(fg, bg);
                            if (ratio < 4.5) {
                                push(node, "low-contrast", `Contrast ${ratio.toFixed(2)}:1 vs "${ancestors[i]!.name}" background (WCAG AA needs 4.5:1).`);
                            }
                            break;
                        }
                    }
                }
            }
        }
        if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
            for (const child of (node as unknown as { children: SceneNode[] }).children) {
                if (issues.length >= maxIssues && scanned >= MAX_SCAN_NODES) break;
                visit(child, [...ancestors, node]);
            }
        }
    };

    visit(root as unknown as SceneNode, []);
    return {
        isError: false,
        content: {
            audited: { id: (root as SceneNode).id, name: (root as SceneNode).name, type: root.type },
            scanned,
            truncated: scanned >= MAX_SCAN_NODES || issues.length >= maxIssues,
            issues,
        },
    };
}
