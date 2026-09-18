import { serializeSceneNode, type SerializedSceneNode } from "./serialize-scene-node";

export function serializeRectangle(rectangle: RectangleNode): SerializedSceneNode {
    return serializeSceneNode(rectangle);
}
