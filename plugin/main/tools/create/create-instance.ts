import { serializeInstance } from "serialization/serialize-instance";
import { CreateInstanceParams } from "@shared/types";
import { ToolResult } from "../tool-result";

export async function createInstance(args: CreateInstanceParams): Promise<ToolResult> {
    const component = await figma.getNodeByIdAsync(args.componentId);
    if (!component) {
        return {
            isError: true,
            content: "Component not found"
        }
    }
    // createInstance() only exists on COMPONENT nodes (COMPONENT_SET has no
    // such method) — fail fast with a clear message instead of
    // "component.createInstance is not a function".
    if (component.type !== "COMPONENT" || typeof (component as ComponentNode).createInstance !== "function") {
        return {
            isError: true,
            content: "Node is not a component (createInstance needs a COMPONENT node)"
        }
    }

    // Validate the parent BEFORE creating the instance: createInstance()
    // auto-parents under figma.currentPage, so a late "Parent node not
    // found" would leak an orphan instance on the current page.
    let parent: (BaseNode & ChildrenMixin) | null = null;
    if (args.parentId) {
        const parentNode = await figma.getNodeByIdAsync(args.parentId);
        if (!parentNode || !("appendChild" in parentNode)) {
            return {
                isError: true,
                content: "Parent node not found"
            }
        }
        parent = parentNode as BaseNode & ChildrenMixin;
    }

    const instance = (component as ComponentNode).createInstance();
    instance.name = args.name;
    instance.x = args.x;
    instance.y = args.y;

    if (parent) {
        parent.appendChild(instance);
    }
    else {
        figma.currentPage.appendChild(instance);
    }

    return {
        isError: false,
        content: serializeInstance(instance)
    }

}