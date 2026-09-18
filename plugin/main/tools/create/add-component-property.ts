import { AddComponentPropertyParams } from "@shared/types";
import { ToolResult } from "../tool-result";

export async function addComponentProperty(args: AddComponentPropertyParams): Promise<ToolResult> {
    const component = await figma.getNodeByIdAsync(args.componentId);
    if (!component) {
        return { isError: true, content: "Component not found" };
    }
    if (!(component.type === "COMPONENT")) {
        return { isError: true, content: "Node is not a component" };
    }
    const componentNode = component as ComponentNode;

    const property = {
        name: args.name,
        type: args.type,
        defaultValue: args.type === "BOOLEAN"
            ? Boolean(args.defaultValue)
            : args.defaultValue,
    };
    componentNode.addComponentProperty(property.name, property.type, property.defaultValue);
    return { isError: false, content: "Component properties added successfully" };
}