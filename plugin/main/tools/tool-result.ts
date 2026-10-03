/**
 * Tool envelope. Two content shapes exist BY DESIGN (not drift — don't merge):
 * - tiny ack (serializeSceneNode: id/x/y/width/height/name/parentId): create
 *   tools confirm placement cheaply.
 * - lean detail (serializeNode/serializeText/…): read + update tools return
 *   layout/colors/content for the next LLM step.
 * `content: unknown` is the socket boundary tax: JSON round-trip erases the
 * static type, so callers narrow with guards, never blind `as` casts.
 */
export type ToolResult = {
    isError: boolean;
    content: unknown;
}