import { convertToHex } from "utils/color-conversion";

/** Lean JSON shape produced by `serializeNode` (layout/colors/content only). */
export interface SerializedNode {
    id: string;
    name: string;
    type: string;
    [key: string]: unknown;
}

export interface SerializedPaint {
    type: string;
    visible?: boolean;
    opacity?: number;
    color?: string;
    gradientStops?: Array<{ position: number; color: string }>;
}

export interface SerializedEffect {
    type: string;
    color?: string;
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
}

export interface SerializeOptions {    // How many levels of children to serialize inline.
    //   0  = children as id/name/type stubs (backwards-compatible)
    //   N  = N levels deep
    //  -1  = full / unlimited — recurse to every leaf (bounded only by maxNodes)
    depth?: number;
    // Optional whitelist of field groups to include. Omit for all.
    fields?: string[];
    // Max number of nodes to fully serialize in one pass (safety budget).
    // Default 10000. When exhausted, remaining nodes become truncated stubs.
    maxNodes?: number;
    // Char budget: stop expanding once serialized output reaches this size, so
    // the response stays returnable inline. Default 35000 (stays under the MCP
    // tool-result token cap; ~62k chars is already too big to return inline).
    maxChars?: number;
}

interface Budget {
    nodes: number;
    chars: number;
    truncated: number;
}

const FIELD_GROUPS = [
    "geometry",
    "layout",
    "fills",
    "strokes",
    "effects",
    "text",
    "component",
    "children",
] as const;

function round(v: number): number {
    return Math.round(v * 100) / 100;
}

type NodeRecord = Record<string, unknown>;

/** A field-group serializer: reads from `n`, writes into `out`. */
type FieldHandler = (n: NodeRecord, node: SceneNode, out: SerializedNode) => void;

/**
 * Run a field handler, degrading to a marker instead of failing the whole
 * node read. Additive by design: one group's crash must never drop the
 * other groups' data — but unlike before, the error is now VISIBLE
 * (`_error` marker + console) instead of silently swallowed.
 */
function runField(group: string, n: NodeRecord, node: SceneNode, out: SerializedNode, fn: FieldHandler): void {
    try {
        fn(n, node, out);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[fimake] serialize ${group} failed for ${node.id}:`, message);
        out[`${group}Error`] = message;
    }
}

function serializeGeometryGroup(n: NodeRecord, _node: SceneNode, out: SerializedNode): void {
    if (typeof n.x === "number") out.x = round(n.x);
    if (typeof n.y === "number") out.y = round(n.y);
    if (typeof n.width === "number") out.width = round(n.width);
    if (typeof n.height === "number") out.height = round(n.height);
    if (typeof n.rotation === "number" && n.rotation !== 0) out.rotation = round(n.rotation);
    if (typeof n.opacity === "number" && n.opacity !== 1) out.opacity = round(n.opacity);
}

function serializeLayoutGroup(n: NodeRecord, _node: SceneNode, out: SerializedNode): void {
    if (n.layoutMode && n.layoutMode !== "NONE") {
        out.layoutMode = n.layoutMode;
        out.paddingLeft = n.paddingLeft;
        out.paddingRight = n.paddingRight;
        out.paddingTop = n.paddingTop;
        out.paddingBottom = n.paddingBottom;
        out.itemSpacing = n.itemSpacing;
        out.primaryAxisAlignItems = n.primaryAxisAlignItems;
        out.counterAxisAlignItems = n.counterAxisAlignItems;
        if (n.layoutWrap && n.layoutWrap !== "NO_WRAP") {
            out.layoutWrap = n.layoutWrap;
            if (typeof n.counterAxisSpacing === "number") out.counterAxisSpacing = n.counterAxisSpacing;
        }
    }
    if (n.layoutSizingHorizontal) out.layoutSizingHorizontal = n.layoutSizingHorizontal;
    if (n.layoutSizingVertical) out.layoutSizingVertical = n.layoutSizingVertical;
    if (n.layoutPositioning === "ABSOLUTE") out.layoutPositioning = "ABSOLUTE";

    const cr = n.cornerRadius;
    if (cr === figma.mixed) {
        out.topLeftRadius = n.topLeftRadius;
        out.topRightRadius = n.topRightRadius;
        out.bottomLeftRadius = n.bottomLeftRadius;
        out.bottomRightRadius = n.bottomRightRadius;
    } else if (typeof cr === "number" && cr !== 0) {
        out.cornerRadius = cr;
    }
}

function serializeFillsGroup(n: NodeRecord, _node: SceneNode, out: SerializedNode): void {
    if (Array.isArray(n.fills) && n.fills.length) {
        const f = serializePaints(n.fills);
        if (f.length) out.fills = f;
    }
}

function serializeStrokesGroup(n: NodeRecord, _node: SceneNode, out: SerializedNode): void {
    if (!Array.isArray(n.strokes) || !n.strokes.length) return;
    out.strokes = serializePaints(n.strokes);
    if (typeof n.strokeWeight === "number") {
        out.strokeWeight = n.strokeWeight;
    } else {
        // Per-side weights differ (strokeWeight is figma.mixed) — e.g.
        // a top-only divider. Emit each side so it isn't flattened
        // into a uniform border.
        if (typeof n.strokeTopWeight === "number") out.strokeTopWeight = n.strokeTopWeight;
        if (typeof n.strokeRightWeight === "number") out.strokeRightWeight = n.strokeRightWeight;
        if (typeof n.strokeBottomWeight === "number") out.strokeBottomWeight = n.strokeBottomWeight;
        if (typeof n.strokeLeftWeight === "number") out.strokeLeftWeight = n.strokeLeftWeight;
    }
    if (n.strokeAlign) out.strokeAlign = n.strokeAlign;
}

function serializeEffectsGroup(n: NodeRecord, _node: SceneNode, out: SerializedNode): void {
    if (Array.isArray(n.effects) && n.effects.length) {
        const e = serializeEffects(n.effects);
        if (e.length) out.effects = e;
    }
}

function serializeTextGroup(_n: NodeRecord, node: SceneNode, out: SerializedNode): void {
    if (node.type !== "TEXT") return;
    const t = node as TextNode;
    out.characters = t.characters;
    // Base (unmixed) style props stay top-level.
    if (t.fontSize !== figma.mixed) out.fontSize = t.fontSize;
    if (t.fontName !== figma.mixed) out.fontName = t.fontName;
    if (t.fontWeight !== figma.mixed) out.fontWeight = t.fontWeight;
    if (t.lineHeight !== figma.mixed) out.lineHeight = t.lineHeight;
    if (t.letterSpacing !== figma.mixed) out.letterSpacing = t.letterSpacing;
    out.textAlignHorizontal = t.textAlignHorizontal;
    out.textAlignVertical = t.textAlignVertical;
    if (t.textCase !== figma.mixed && t.textCase !== "ORIGINAL") out.textCase = t.textCase;
    if (t.textDecoration !== figma.mixed && t.textDecoration !== "NONE") out.textDecoration = t.textDecoration;

    // A text node can have multiple style runs (e.g. a red "*" in a
    // label, or a bold span). When some style prop is `figma.mixed`, the
    // single top-level value is lost — so emit per-segment runs with
    // their own color/font. This is what makes multi-color labels
    // reconstructable instead of silently flattened.
    const fillsMixed = (t.fills as unknown) === figma.mixed;
    const styleMixed =
        fillsMixed ||
        t.fontName === figma.mixed ||
        t.fontSize === figma.mixed ||
        t.fontWeight === figma.mixed ||
        t.textDecoration === figma.mixed;

    if (!fillsMixed && Array.isArray(t.fills) && t.fills.length) {
        out.fills = serializePaints(t.fills);
    }

    if (styleMixed) {
        const runs = t.getStyledTextSegments([
            "fills",
            "fontName",
            "fontSize",
            "fontWeight",
        ]);
        out.segments = runs.map((r) => {
            const seg: Record<string, unknown> = { characters: r.characters };
            if (Array.isArray(r.fills) && r.fills.length) {
                seg.fills = serializePaints(r.fills);
            }
            if (r.fontName) seg.fontName = r.fontName;
            if (typeof r.fontSize === "number") seg.fontSize = r.fontSize;
            if (typeof r.fontWeight === "number") seg.fontWeight = r.fontWeight;
            return seg;
        });
    }
}

// Guarded: reading component/variant props on a component set with existing
// errors used to throw and fail the whole node read. Now it degrades to a
// marker and the rest of the node still serializes.
//
// Field differs by node kind (real-file finding): INSTANCE nodes expose
// `componentProperties` (live values), while COMPONENT / COMPONENT_SET nodes
// expose `componentPropertyDefinitions` (defs with type + defaultValue).
// Reading the wrong field silently drops props — components looked
// property-less even right after add-component-property succeeded.
function serializeComponentPropsGroup(n: NodeRecord, node: SceneNode, out: SerializedNode): void {
    if (!(node.type === "INSTANCE" || node.type === "COMPONENT" || node.type === "COMPONENT_SET")) return;
    try {
        if (node.type === "INSTANCE") {
            const props: unknown = n.componentProperties;
            if (props !== null && typeof props === "object") {
                const cp: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(props)) {
                    cp[key] = (value as { value?: unknown }).value;
                }
                if (Object.keys(cp).length) out.componentProperties = cp;
            }
            return;
        }
        const defs: unknown = n.componentPropertyDefinitions;
        if (defs !== null && typeof defs === "object") {
            const cp: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(defs)) {
                if (value !== null && typeof value === "object" && "defaultValue" in (value as Record<string, unknown>)) {
                    const d = value as { type?: unknown; defaultValue?: unknown };
                    cp[key] = { type: d.type, defaultValue: d.defaultValue };
                } else {
                    cp[key] = value;
                }
            }
            if (Object.keys(cp).length) out.componentProperties = cp;
        }
    } catch (e) {
        out.componentProperties = { _error: e instanceof Error ? e.message : String(e) };
    }
}

const FIELD_HANDLERS: Record<(typeof FIELD_GROUPS)[number], FieldHandler> = {
    geometry: serializeGeometryGroup,
    layout: serializeLayoutGroup,
    fills: serializeFillsGroup,
    strokes: serializeStrokesGroup,
    effects: serializeEffectsGroup,
    text: serializeTextGroup,
    component: serializeComponentPropsGroup,
    children: () => {},
};

// Figma paint colors are RGB(A) with channels in the 0..1 range. Convert to a
// familiar #RRGGBBAA hex so callers get usable colors without post-processing.
function paintColorToHex(color: RGB | RGBA): string {
    return convertToHex(color as { r: number; g: number; b: number; a?: number });
}

function serializePaints(paints: readonly Paint[]): SerializedPaint[] {
    const out: SerializedPaint[] = [];
    for (const p of paints) {
        const item: SerializedPaint = { type: p.type };
        if (p.visible === false) item.visible = false;
        if (typeof p.opacity === "number" && p.opacity !== 1) item.opacity = round(p.opacity);

        if (p.type === "SOLID") {
            item.color = paintColorToHex(p.color);
        } else if (
            p.type === "GRADIENT_LINEAR" ||
            p.type === "GRADIENT_RADIAL" ||
            p.type === "GRADIENT_ANGULAR" ||
            p.type === "GRADIENT_DIAMOND"
        ) {
            item.gradientStops = (p as GradientPaint).gradientStops.map((s) => ({
                position: round(s.position),
                color: paintColorToHex(s.color),
            }));
        }
        // IMAGE / VIDEO / PATTERN: type only (no huge blob data)
        out.push(item);
    }
    return out;
}

function serializeEffects(effects: readonly Effect[]): SerializedEffect[] {
    const out: SerializedEffect[] = [];
    for (const e of effects) {
        if (e.visible === false) continue;
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
            const s = e as DropShadowEffect;
            out.push({
                type: s.type,
                color: paintColorToHex(s.color),
                offset: { x: round(s.offset.x), y: round(s.offset.y) },
                radius: round(s.radius),
                spread: round(s.spread || 0),
            });
        } else {
            // LAYER_BLUR / BACKGROUND_BLUR etc.
            out.push({ type: e.type, radius: round((e as BlurEffect).radius || 0) });
        }
    }
    return out;
}

// Lean, use-case-focused serializer: layout, colors and content only.
// Deliberately omits fillGeometry/strokeGeometry (vector path data),
// boundVariables/inferredVariables and other heavy metadata that bloat the
// payload without helping reconstruct a design.
export function serializeNode(
    node: SceneNode,
    opts: SerializeOptions = {},
    visited: Set<string> = new Set(),
    budget?: Budget
): SerializedNode {
    const isRoot = budget === undefined;
    const rawDepth = opts.depth;
    // undefined -> 0 (only this node); negative -> unlimited (full subtree)
    const depth =
        rawDepth === undefined
            ? 0
            : rawDepth < 0
                ? Number.POSITIVE_INFINITY
                : rawDepth;
    // The budget is created once on the top-level call and shared across the
    // whole recursion so a single response stays bounded (by node count AND by
    // serialized size, so it always comes back inline).
    if (!budget) {
        const maxNodes = Math.max(1, Math.min(100000, opts.maxNodes ?? 10000));
        const maxChars = Math.max(1000, Math.min(150000, opts.maxChars ?? 35000));
        budget = { nodes: maxNodes, chars: maxChars, truncated: 0 };
    }
    const fields = opts.fields;
    const want = (group: (typeof FIELD_GROUPS)[number]) =>
        !fields || fields.indexOf(group) !== -1;

    if (visited.has(node.id)) {
        return { id: node.id, name: node.name, type: node.type, _circular: true };
    }
    visited.add(node.id);

    const n = node as unknown as Record<string, unknown>;
    const out: SerializedNode = { id: node.id, name: node.name, type: node.type };
    if (node.visible === false) out.visible = false;

    for (const group of FIELD_GROUPS) {
        if (group === "children") continue;
        if (want(group)) runField(group, n, node, out, FIELD_HANDLERS[group]);
    }

    // Reserve a small overhead for JSON wrappers; actual children accounted below.
    // We charge the node's own fields now, and each child's full serialized size
    // is charged inside its recursive call, so the sum is accurate.
    const ownSize = JSON.stringify(out).length;
    budget.chars -= ownSize;

    if (want("children") && Array.isArray(n.children) && n.children.length) {
        if (depth > 0) {
            const kids: SerializedNode[] = [];
            let truncated = false;
            for (const child of n.children as SceneNode[]) {
                // Stop expanding when EITHER budget is spent (node count or size).
                // Estimate remaining wrapper overhead (~2 chars per child for commas/brackets)
                if (budget.nodes <= 0 || budget.chars <= 2) {
                    kids.push({
                        id: child.id,
                        name: child.name,
                        type: child.type,
                        _truncated: true,
                    });
                    truncated = true;
                    continue;
                }
                budget.nodes--;
                // Snapshot chars before recursing to detect if child pushes us over
                const beforeChars = budget.chars;
                const serializedChild = serializeNode(
                    child,
                    { depth: depth - 1, fields, maxNodes: opts.maxNodes, maxChars: opts.maxChars },
                    visited,
                    budget
                );
                // If child's subtree exhausted the char budget, we already counted it
                // accurately inside recursion (each node stringifies its own `out`).
                // No extra adjustment needed — just continue. The budget now reflects reality.
                void beforeChars;
                kids.push(serializedChild);
            }
            // Account for children array wrapper overhead (brackets, commas, key)
            // Approx: `{"children":[]}` ~14 chars + 1 per child comma
            const wrapperOverhead = 14 + Math.max(0, kids.length - 1);
            budget.chars -= wrapperOverhead;
            out.children = kids;
            if (truncated) {
                out.childrenTruncated = true;
                budget.truncated++; // budget-driven cut -> counts toward _truncatedCount
            }
        } else {
            // Depth limit reached but this node still has children — surface
            // them as stubs AND flag, so nothing below is dropped silently.
            // (This is the caller's explicit depth choice, not a budget wall,
            // so it does NOT count toward _truncatedCount.)
            out.children = (n.children as SceneNode[]).map((child: SceneNode) => ({
                id: child.id,
                name: child.name,
                type: child.type,
            }));
            out.childrenTruncated = true;
            // Charge stub size too for accurate budget tracking
            budget.chars -= JSON.stringify(out.children).length;
        }
    }

    // On the top-level node, report how many branches were cut by the budget so
    // the caller knows follow-up reads are needed (and can find them by the
    // `childrenTruncated` flags).
    if (isRoot && budget.truncated > 0) {
        out._truncatedCount = budget.truncated;
        // Reserve for _truncatedCount field itself
        budget.chars -= JSON.stringify({ _truncatedCount: budget.truncated }).length;
    }

    return out;
}
