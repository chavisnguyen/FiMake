import { serializeNode, type SerializedNode } from "./serialization";

export interface SerializedPage {
    id: string;
    name: string;
    nodes: SerializedNode[];
}

export function serializePage(page: PageNode): SerializedPage {
    return {
        id: page.id,
        name: page.name,
        nodes: page.children.map((node) => serializeNode(node)),
    };
}
