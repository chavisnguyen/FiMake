import { serializeSceneNode, type SerializedSceneNode } from "./serialize-scene-node";

export function serializeFrame(frame: FrameNode): SerializedSceneNode {
    return serializeSceneNode(frame);
}
