import { SetCornerRadiusParams } from "@shared/types/params/update/set-corner-radius";
import { ToolResult } from "../tool-result";
import { withNode } from "../node-helper";

export async function setCornerRadius(args: SetCornerRadiusParams): Promise<ToolResult> {
    return withNode(args.id, (node) => {
        if ("cornerRadius" in node) {
            (node as unknown as { cornerRadius: number }).cornerRadius = args.cornerRadius;
        }

        if ("topLeftRadius" in node && args.topLeftRadius) {
            (node as unknown as { topLeftRadius: number }).topLeftRadius = args.topLeftRadius!;
        }
        if ("topRightRadius" in node && args.topRightRadius) {
            (node as unknown as { topRightRadius: number }).topRightRadius = args.topRightRadius!;
        }
        if ("bottomLeftRadius" in node && args.bottomLeftRadius) {
            (node as unknown as { bottomLeftRadius: number }).bottomLeftRadius = args.bottomLeftRadius!;
        }
        if ("bottomRightRadius" in node && args.bottomRightRadius) {
            (node as unknown as { bottomRightRadius: number }).bottomRightRadius = args.bottomRightRadius;
        }
    });
}
