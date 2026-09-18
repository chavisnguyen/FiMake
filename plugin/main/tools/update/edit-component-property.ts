import { EditComponentPropertyParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";

export async function editComponentProperty(args: EditComponentPropertyParams): Promise<ToolResult> {
    const component = await figma.getNodeByIdAsync(args.componentId);
    if (!component) {
        return { isError: true, content: "Component not found" };
    }
    if (!(component.type === "COMPONENT")) {
        return { isError: true, content: "Node is not a component" };
    }
    const componentNode = component as ComponentNode;

    let preferredValues: InstanceSwapPreferredValue[] = [];
    if (args.type === "INSTANCE_SWAP") {
        if (!args.preferredValues) {
            return { isError: true, content: "Preferred values are required for instance swap property" };
        }
        preferredValues = args.preferredValues.map(value => ({
            type: "COMPONENT",
            key: value,
        })) || [];
    }

    const componentProperty = componentNode.editComponentProperty(args.name, {
        name: args.name,
        defaultValue: args.defaultValue,
        preferredValues: preferredValues,
    });

    return { isError: false, content: componentProperty };
}