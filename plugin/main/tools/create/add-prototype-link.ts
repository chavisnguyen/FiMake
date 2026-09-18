import { AddPrototypeLinkParams } from "@shared/types";
import { ToolResult } from "../tool-result";

type NodeAction = Extract<Action, { type: "NODE" }>;

export async function addPrototypeLink(args: AddPrototypeLinkParams): Promise<ToolResult> {
    const sourceNode = await figma.getNodeByIdAsync(args.nodeId);
    if (!sourceNode) {
        return { isError: true, content: "Source node not found" };
    }

    const destinationNode = await figma.getNodeByIdAsync(args.destinationId);
    if (!destinationNode) {
        return { isError: true, content: "Destination node not found" };
    }

    if (!("reactions" in sourceNode) || !("setReactionsAsync" in sourceNode)) {
        return { isError: true, content: "Source node does not support reactions" };
    }

    const sceneNode = sourceNode as SceneNode & ReactionMixin;

    // Build transition - match exact Figma format
    let transition: Transition | null = null;
    if (args.transition !== "INSTANT") {
        const directional: ReadonlyArray<DirectionalTransition["type"]> = ["MOVE_IN", "MOVE_OUT", "PUSH", "SLIDE_IN", "SLIDE_OUT"];
        if ((directional as ReadonlyArray<string>).indexOf(args.transition) >= 0) {
            transition = {
                type: args.transition as DirectionalTransition["type"],
                direction: "LEFT",
                matchLayers: false,
                duration: args.duration / 1000,
                easing: { type: "EASE_IN_AND_OUT" }
            };
        } else {
            transition = {
                type: args.transition as SimpleTransition["type"],
                duration: args.duration / 1000,
                easing: { type: "EASE_IN_AND_OUT" }
            };
        }
    }

    // Match exact Figma reaction format - both action and actions
    const actionObj: NodeAction = {
        type: "NODE",
        destinationId: args.destinationId,
        navigation: args.navigation,
        transition: transition,
        resetVideoPosition: false
    };

    const reaction: Reaction = {
        action: actionObj,
        actions: [actionObj],
        trigger: { type: args.trigger }
    };

    const existing = sceneNode.reactions || [];
    const existingReactions: Reaction[] = [...existing, reaction];

    await sceneNode.setReactionsAsync(existingReactions);

    return {
        isError: false,
        content: "Prototype link added: " + sceneNode.name + " -> " + destinationNode.name
    };
}
