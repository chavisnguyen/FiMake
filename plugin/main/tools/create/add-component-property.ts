import { AddComponentPropertyParams } from "@shared/types";
import { ToolResult } from "../tool-result";

export async function addComponentProperty(args: AddComponentPropertyParams): Promise<ToolResult> {
    const component = await figma.getNodeByIdAsync(args.componentId);
    if (!component) {
        return { isError: true, content: "Component not found" };
    }
    // Both COMPONENT and COMPONENT_SET nodes carry component property
    // definitions (ComponentPropertiesMixin) — Figma allows defining them
    // on a set, so don't reject COMPONENT_SET here.
    if (!(component.type === "COMPONENT" || component.type === "COMPONENT_SET")) {
        return { isError: true, content: "Node is not a component" };
    }
    const componentNode = component as ComponentNode;

    // defaultValue arrives as a string (schema): parse "true"/"false"
    // explicitly — Boolean("false") === true would flip the default.
    const parseBooleanDefault = (raw: string): boolean => {
        const lowered = raw.trim().toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
        return Boolean(raw);
    };
    const property = {
        name: args.name,
        type: args.type,
        defaultValue: args.type === "BOOLEAN"
            ? parseBooleanDefault(args.defaultValue)
            : args.defaultValue,
    };
    componentNode.addComponentProperty(property.name, property.type, property.defaultValue);
    return { isError: false, content: "Component properties added successfully" };
}