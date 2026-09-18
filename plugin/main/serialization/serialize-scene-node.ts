export interface SerializedSceneNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    parentId?: string;
}

export function serializeSceneNode(sceneNode: SceneNode): SerializedSceneNode {
    return {
        id: sceneNode.id,
        x: sceneNode.x,
        y: sceneNode.y,
        width: sceneNode.width,
        height: sceneNode.height,
        name: sceneNode.name,
        parentId: sceneNode.parent
            ? `${sceneNode.parent.id}:${sceneNode.parent.type}`
            : undefined
    };
}
