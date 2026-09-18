export interface SerializedComponent {
    id: string;
    name: string;
    key: string;
    properties: unknown;
}

export function serializeComponent(component: ComponentNode | ComponentSetNode): SerializedComponent {
    return {
        id: component.id,
        name: component.name,
        key: component.key,
        properties: component.componentPropertyDefinitions,
    };
}
