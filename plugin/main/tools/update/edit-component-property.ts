import { EditComponentPropertyParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { resolvePropertyKey } from "utils/component-property-key";

export async function editComponentProperty(args: EditComponentPropertyParams): Promise<ToolResult> {
    const component = await figma.getNodeByIdAsync(args.componentId);
    if (!component) {
        return { isError: true, content: "Component not found" };
    }
    if (!(component.type === "COMPONENT")) {
        return { isError: true, content: "Node is not a component" };
    }
    const componentNode = component as ComponentNode;

    // preferredValues is INSTANCE_SWAP-only: Figma rejects even an empty
    // array for TEXT/BOOLEAN/VARIANT ("Preferred values are not supported
    // for this property type" — real-file finding), so omit it entirely.
    const options: { name: string; defaultValue: string; preferredValues?: InstanceSwapPreferredValue[] } = {
        name: args.name,
        defaultValue: args.defaultValue,
    };
    if (args.type === "INSTANCE_SWAP") {
        if (!args.preferredValues) {
            return { isError: true, content: "Preferred values are required for instance swap property" };
        }
        options.preferredValues = args.preferredValues.map(value => ({
            type: "COMPONENT",
            key: value,
        })) || [];
    }

    const key = resolvePropertyKey(componentNode, args.name);
    const componentProperty = componentNode.editComponentProperty(key, options);

    return { isError: false, content: componentProperty };
}