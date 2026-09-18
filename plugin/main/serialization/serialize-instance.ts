export interface SerializedInstance {
    id: string;
    name: string;
    x: number;
    y: number;
    parentId?: string;
    properties: unknown;
}

export function serializeInstance(instance: InstanceNode): SerializedInstance {
    return {
        id: instance.id,
        name: instance.name,
        x: instance.x,
        y: instance.y,
        parentId: instance.parent ? `${instance.parent.id}` : undefined,
        properties: instance.componentProperties,
    };
}
