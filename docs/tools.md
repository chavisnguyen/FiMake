# Tools (29)

23 tools forward directly to the plugin (`name` = task command), 6 have extra Node-side logic.

Contract parity is enforced by `mcp/tests/contract/mcp-tools.test.ts` and `NODE_ONLY_TOOLS` in `mcp/src/tools/registry.ts`.

| Tool | Side | Description |
|---|---|---|
| `create-rectangle` | plugin | Create a rectangle. |
| `create-frame` | plugin | Create a frame. |
| `create-text` | plugin | Create a text. |
| `create-instance` | plugin | Create an instance. |
| `create-component` | plugin | Create a component. |
| `clone-node` | plugin | Clone a node. |
| `add-component-property` | plugin | Add a component property. |
| `add-prototype-link` | plugin | Add a prototype interaction (click to navigate) between two nodes. |
| `get-node-info` | plugin | Lean layout/colors/content. `depth`: 0 = node only, N = N levels, -1 = full subtree. `maxNodes` (default 10000) + `maxChars` (default 35000) cap size; overflow becomes `_truncated` stubs with `childrenTruncated: true` and root `_truncatedCount` — re-request flagged ids. `fields` limits groups. |
| `get-pages` | plugin | Get all pages in the current file. |
| `get-all-components` | plugin | Get all components in the current file. |
| `move-node` | plugin | Move a node. |
| `resize-node` | plugin | Resize a node. |
| `set-fill-color` | plugin | Set the fill color of a node. |
| `set-stroke-color` | plugin | Set the stroke color of a node. |
| `set-corner-radius` | plugin | Set the corner radius of a node. |
| `set-layout` | plugin | Set the layout of a node. Turning auto-layout on keeps a FIXED frame's size on any axis whose `layoutSizing*` is omitted (Figma would default to HUG). |
| `set-parent-id` | plugin | Move a node into a parent or reorder it. `index` = position among children (0 = bottom of z-order, omit = append); `absolute` = ABSOLUTE positioning inside an auto-layout parent (overlays). |
| `set-instance-properties` | plugin | Set the properties of an instance. |
| `edit-component-property` | plugin | Edit a component property. |
| `set-node-component-property-references` | plugin | Set the component property references of a node. |
| `delete-node` | plugin | Delete a node. |
| `delete-component-property` | plugin | Delete a component property. |
| `get-selection` | node+plugin | Get the current selection in Figma. No params; returns whole TaskResult. |
| `create-image` | node+plugin | Fetches `url` in Node (no CORS), forwards `imageData` bytes to plugin. |
| `create-svg` | node+plugin | Editable vector from SVG: exactly one of `svg` (inline), `url` (fetched in Node, same SSRF guards as `create-image`), `filePath` (local `.svg`). Keeps intrinsic size; `x`/`y`/`parentId` place it. Max 5MB, rejects `<!ENTITY`. |
| `export-asset` | node+plugin | Rendered asset with real path data (`SVG` markup or `PNG`/`JPG` base64, `scale` max 4). With `outputPath`, writes to disk and returns `{path, bytes}` (max 20MB). |
| `export-file` | node-only | Fans out over `get-pages` + `get-node-info` and writes one JSON per top-level frame + `manifest.json`. Params: `outputDir` (default `<cwd>/exports/export-<ts>`), `maxNodes` (default 5000), `maxChars` (default 35000). Guarded: max 500 frames, all writes confined to `outputDir`. No plugin handler by design. |
| `list-clients` | node-only | List open Figma files with the plugin connected (one entry per window: `fileName`, `fileKey`, `connectedAt`). No plugin handler by design. |

## Multi-window targeting

Every tool accepts `targetFileKey` (stable id, preferred) and `targetFileName` (human fallback). Both omitted = broadcast to all connected windows (old behavior).

1. Call `list-clients` to see what's open.
2. Pass `targetFileKey` on every follow-up call so only that file executes.
3. A task targeted at a file that isn't open yet stays queued and fires when its window connects (or times out via `TASK_TIMEOUT_MS`).

## Tips

- Large `get-node-info` calls on huge files are the usual cause of timeouts — retry with smaller `depth` / `maxNodes` / `maxChars`, or raise `TASK_TIMEOUT_MS` in `mcp/.env`. See [Troubleshooting](./troubleshooting.md).
- Some clients cap the tool count — disable tools you do not need in the client config.
