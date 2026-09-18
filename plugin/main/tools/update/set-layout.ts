import { SetLayoutParams } from "@shared/types/params/update/set-layout";
import { serializeNode } from "serialization/serialization";
import { ToolResult } from "tools/tool-result";
import { loadNode } from "../node-helper";

/** [nodeProp, paramValue, transform?] — one entry per settable prop. */
type LayoutEntry = readonly [prop: string, value: unknown, transform?: (v: never) => unknown];

export async function setLayout(args: SetLayoutParams): Promise<ToolResult> {
    const loaded = await loadNode(args.id);
    if ("isError" in loaded) return loaded;
    const node = loaded as unknown as Record<string, unknown>;

    const errors: string[] = [];
    const apply = (prop: string, value: unknown, transform?: (v: never) => unknown): void => {
        if (value === undefined || value === null || value === false || value === "") return;
        if (!(prop in node)) {
            errors.push(`Node does not have a ${prop} property`);
            return;
        }
        node[prop] = transform ? transform(value as never) : value;
    };

    const entries: LayoutEntry[] = [
        ["layoutMode", args.mode],
        ["layoutWrap", args.wrap, (v: boolean) => (v ? "WRAP" : "NO_WRAP")],
        ["clipContent", args.clip],
        ["itemSpacing", args.itemSpacing],
        ["primaryAxisAlignItems", args.primaryAxisAlignItems],
        ["counterAxisAlignItems", args.counterAxisAlignItems],
        ["paddingLeft", args.paddingLeft],
        ["paddingRight", args.paddingRight],
        ["paddingTop", args.paddingTop],
        ["paddingBottom", args.paddingBottom],
        ["layoutSizingVertical", args.layoutSizingVertical],
        ["layoutSizingHorizontal", args.layoutSizingHorizontal],
    ];
    // itemSpacing/axis alignment only apply inside an auto-layout frame.
    const gated = args.mode === "HORIZONTAL" || args.mode === "VERTICAL"
        ? entries
        : entries.filter(([prop]) => !["itemSpacing", "primaryAxisAlignItems", "counterAxisAlignItems"].includes(prop));
    for (const [prop, value, transform] of gated) apply(prop, value, transform);

    if (errors.length > 0) {
        return { isError: true, content: errors.join("\n") + "\n" };
    }

    return {
        isError: false,
        content: serializeNode(node as unknown as SceneNode)
    }
}
