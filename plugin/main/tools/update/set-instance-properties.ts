import { SetInstancePropertiesParams } from "@shared/types";
import { serializeInstance } from "serialization/serialize-instance";
import { ToolResult } from "tools/tool-result";

export async function setInstanceProperties(args: SetInstancePropertiesParams): Promise<ToolResult> {
    const instance = await figma.getNodeByIdAsync(args.instanceId);
    if (!instance) {
        return { isError: true, content: "Instance not found" };
    }
    if (!(instance.type === "INSTANCE")) {
        return { isError: true, content: "Node is not an instance" };
    }
    const instanceNode = instance as InstanceNode;
    instanceNode.setProperties(args.properties as { [propertyName: string]: string | boolean | VariableAlias });

    const updatedInstance = await figma.getNodeByIdAsync(args.instanceId);

    return { isError: false, content: serializeInstance(updatedInstance as InstanceNode) };
}