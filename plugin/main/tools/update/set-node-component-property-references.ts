import { SetNodeComponentPropertyReferencesParams } from "@shared/types";
import { ToolResult } from "tools/tool-result";
import { withNode } from "../node-helper";

export async function setNodeComponentPropertyReferences(args: SetNodeComponentPropertyReferencesParams): Promise<ToolResult> {
    return withNode(args.id, (node) => {
        (node as unknown as SceneNode).componentPropertyReferences = args.componentPropertyReferences;
    });
}
