export interface SerializedComponent {
    id: string;
    name: string;
    key: string;
    properties: unknown;
}

export function serializeComponent(component: ComponentNode | ComponentSetNode): SerializedComponent {
    // Variants (ComponentNode inside a ComponentSet) THROW on this getter —
    // degrade to a visible marker instead of failing the whole
    // get-all-components call (same philosophy as runField in
    // serialization.ts: one node's crash must never drop the rest).
    let properties: unknown;
    try {
        properties = component.componentPropertyDefinitions;
    } catch (e) {
        properties = { _error: e instanceof Error ? e.message : String(e) };
    }
    return {
        id: component.id,
        name: component.name,
        key: component.key,
        properties,
    };
}
