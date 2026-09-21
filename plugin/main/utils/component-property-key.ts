/**
 * Figma stores component props under generated keys (`Label#2045:2`), but
 * users (and LLMs) naturally say `Label`. Resolve a short name to its full
 * key by scanning `componentPropertyDefinitions`.
 *
 * Real-file finding: add-component-property succeeds with `Label`, yet
 * edit/delete/set-instance-properties with `Label` all fail — Figma only
 * accepts the full `Label#id` key. Exact match wins; otherwise the first
 * `name#...` key wins; otherwise the name passes through untouched so Figma
 * errors naturally (and fixtures lock that behavior).
 */
export function resolvePropertyKey(
    component: { componentPropertyDefinitions?: unknown } | null | undefined,
    name: string,
): string {
    const defs = component?.componentPropertyDefinitions;
    if (defs === null || defs === undefined || typeof defs !== "object") return name;
    const keys = Object.keys(defs as Record<string, unknown>);
    if (keys.includes(name)) return name;
    return keys.find((k) => k.startsWith(`${name}#`)) ?? name;
}
