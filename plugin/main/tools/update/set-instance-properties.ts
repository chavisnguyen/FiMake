import { SetInstancePropertiesParams } from "@shared/types";
import { serializeInstance } from "serialization/serialize-instance";
import { ToolResult } from "tools/tool-result";
import { resolvePropertyKey } from "utils/component-property-key";

export async function setInstanceProperties(args: SetInstancePropertiesParams): Promise<ToolResult> {
    const instance = await figma.getNodeByIdAsync(args.instanceId);
    if (!instance) {
        return { isError: true, content: "Instance not found" };
    }
    if (!(instance.type === "INSTANCE")) {
        return { isError: true, content: "Node is not an instance" };
    }
    const instanceNode = instance as InstanceNode;
    // Instance props are keyed `Label#id` too — resolve short names via the
    // main component's definitions (real-file finding). Detached instances
    // (null) fall through with names untouched.
    // NOTE: sync `mainComponent` throws under dynamic-page documentAccess
    // ("Use node.getMainComponentAsync instead") — always use the async one.
    let main: { componentPropertyDefinitions?: unknown } | null = null;
    try {
        main = await instanceNode.getMainComponentAsync();
    } catch {
        main = null;
    }
    const resolved: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(args.properties)) {
        resolved[resolvePropertyKey(main, key)] = value as string | boolean;
    }
    instanceNode.setProperties(resolved as { [propertyName: string]: string | boolean | VariableAlias });

    const updatedInstance = await figma.getNodeByIdAsync(args.instanceId);

    return { isError: false, content: serializeInstance(updatedInstance as InstanceNode) };
}