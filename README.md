# Fimake

[![release](https://img.shields.io/github/v/release/chavisnguyen/FiMake)](https://github.com/chavisnguyen/FiMake/releases)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

## Problem

The official Figma MCP server is read-only. **You cannot change anything in the Figma document with it.**
Chatting in Figma Make and then moving the result back to Figma to continue is inconvenient.

**Fimake lets AI agents work directly in your Figma documents** — create, edit, organize, and read.

## Install for users (5 minutes, no repo clone)

Prerequisites: `Node.js >= 22`, Figma Desktop, an MCP client (Claude Code / Cursor / Claude Desktop).

### 1. Install the Figma plugin (sideload, once)

Fimake ships as a **dev plugin** (sideload from manifest). There is no Figma Community listing — the plugin needs a local socket bridge (`localhost:10101`), which Figma does not allow for published listings. This is the same model as other MCP bridges.

1. Download `fimake-plugin.zip` from [GitHub Releases](../../releases) and unzip it.
2. In Figma: *Plugins > Development > Import plugin from manifest*, select `manifest.json` from the unzipped folder.
3. Run it via *Plugins > Development > Fimake*. Expected: **Not connected to MCP server**.
4. **Keep the plugin window open.** It flips to **Connected** once the MCP server (step 2) is running.

> Compatibility: use the plugin zip and the binary from the **same release** (e.g. both `v1.0.x`). Default port is `10101` on both sides.

### 2. Run the MCP server (pick one)

**A. Standalone binary (recommended, no Node needed).** Download `fimake-<your-os>` from [GitHub Releases](../../releases) (`fimake-macos-arm64`, `fimake-macos-x64`, `fimake-linux-x64`), make it executable (`chmod +x fimake-*` on macOS/Linux), then point your client at it:

```json
{
  "mcpServers": {
    "fimake": {
      "command": "/absolute/path/to/fimake-macos-arm64",
      "env": { "TRANSPORT": "stdio", "PORT": "10101" }
    }
  }
}
```

**B. From source (contributors).** Clone, build once, point at the local file (needs `Node.js >= 22`):

```bash
git clone https://github.com/chavisnguyen/FiMake.git
cd FiMake && make install && make build
```

```json
{
  "mcpServers": {
    "fimake": {
      "command": "node",
      "args": ["/absolute/path/to/FiMake/mcp/dist/index.js"],
      "env": { "TRANSPORT": "stdio", "PORT": "10101" }
    }
  }
}
```

Where to put the config:

- **Claude Code / generic client / Inspector:** paste into your MCP config.
- **Cursor:** `~/.cursor/mcp.json` or project `.cursor/mcp.json`.
- **Claude Desktop:** `claude_desktop_config.json`.

Then restart the client if it requires it and ask something like *"list the pages in this Figma file"*. The plugin window should show the task appear and settle (`Task started: get-pages ...` → `Task finished: ...`).

### Alternative: `streamable-http` (advanced)

Use this only if your client requires an HTTP endpoint (or you want the Inspector over HTTP). You run the server yourself and point the client at a URL:

```bash
TRANSPORT=streamable-http ./fimake-macos-arm64
# serves http://localhost:10101/mcp
```

```json
{
  "mcpServers": {
    "fimake": { "url": "http://localhost:10101/mcp" }
  }
}
```

Full client configs, env table, and custom `PORT` checklist live in [docs/usage.md](docs/usage.md).

📖 **Hosted docs:** [chavisnguyen.github.io/FiMake](https://chavisnguyen.github.io/FiMake) — same content with search, sidebar, and diagrams (deployed from `docs/` via VitePress + GitHub Pages).

| Guide | When to read it |
|---|---|
| [Quickstart](docs/quickstart.md) | 5-minute install (plugin + server + client config) |
| [docs/usage.md](docs/usage.md) | Full setup, HTTP + `stdio` configs, env table, custom `PORT` |
| [docs/tools.md](docs/tools.md) | All 27 tools reference |
| [docs/architecture.md](docs/architecture.md) | Bridge, task map, diagrams, security |
| [docs/troubleshooting.md](docs/troubleshooting.md) | `Not connected`, port in use, timeouts, logs |
| [docs/development.md](docs/development.md) | Contributor guide: `make` targets, watch mode, tests, architecture |

## Tools

27 tools: 23 forward directly to the plugin (`name` = task command), 4 have extra Node-side logic.

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
| `set-layout` | plugin | Set the layout of a node. |
| `set-parent-id` | plugin | Set the parent id of a node. |
| `set-instance-properties` | plugin | Set the properties of an instance. |
| `edit-component-property` | plugin | Edit a component property. |
| `set-node-component-property-references` | plugin | Set the component property references of a node. |
| `delete-node` | plugin | Delete a node. |
| `delete-component-property` | plugin | Delete a component property. |
| `get-selection` | node+plugin | Get the current selection in Figma. No params; returns whole TaskResult. |
| `create-image` | node+plugin | Fetches `url` in Node (no CORS), forwards `imageData` bytes to plugin. |
| `export-asset` | node+plugin | Rendered asset with real path data (`SVG` markup or `PNG`/`JPG` base64, `scale` max 4). With `outputPath`, writes to disk and returns `{path, bytes}` (max 20MB). |
| `export-file` | node-only | Fans out over `get-pages` + `get-node-info` and writes one JSON per top-level frame + `manifest.json`. Params: `outputDir` (default `<cwd>/exports/export-<ts>`), `maxNodes` (default 5000), `maxChars` (default 35000). Guarded: max 500 frames, all writes confined to `outputDir`. No plugin handler by design. |

Contract parity is enforced by `mcp/tests/contract/mcp-tools.test.ts` and `NODE_ONLY_TOOLS` in `mcp/src/tools/registry.ts`.

## Install for contributors

```bash
make install   # pnpm install (mcp + plugin)
make check     # pre-push gate: typecheck + lint + test + build
make dev-mcp    # watch + restart the MCP server
make dev-plugin # watch + rebuild the plugin (re-import it in Figma to reload)
```

See [docs/development.md](docs/development.md) for the full guide. After a plugin rebuild, **re-import** it in Figma — Figma does not hot-reload the bundle.

## Architecture

Socket.IO is the bridge between the MCP server and the Figma plugin.

MCP server runs a *Hono (Node)* server with MCP endpoints plus a *Socket.IO* server for the plugin.
It saves tool calls into a task map and sends `start-task` over WebSockets with ack + retry queue.

The Figma plugin listens on the WebSocket, dispatches via `TOOL_HANDLERS`, runs the Figma API, and returns the result.
Only page-fan-out tools call `figma.loadAllPagesAsync()`; single-node tools skip it.

Timed-out tasks resolve `isError:true`. Stale queued messages expire via TTL + max retries. StreamableHTTP creates one `McpServer` per client session sharing a single Figma bridge, so sessions can't leak into each other.

```mermaid
flowchart TB
    subgraph Server["MCP Server (Node: Hono + Socket.IO)"]
        MCP["MCP endpoint<br/>/mcp + /health"]
        Bridge["Figma bridge<br/>task map + ack + retry queue<br/>TTL + timeout"]
        WS["Socket.IO server"]
        MCP <--> Bridge
        Bridge <--> WS
    end
    Agent["AI Agent<br/>Claude / Cursor / Inspector"] <--> MCP
    Plugin["Figma Plugin<br/>TOOL_HANDLERS + Figma API"] <--> WS
    Plugin <--> FigmaDoc["Figma Document"]
```

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant MCP as MCP Server
    participant Plugin as Figma Plugin
    participant Figma as Figma API
    Agent->>MCP: callTool(name, params)
    MCP->>MCP: save task (map + TTL)
    MCP->>Plugin: start-task via Socket.IO (ack + retry)
    Plugin->>Figma: TOOL_HANDLERS[name](params)
    Figma-->>Plugin: result
    Plugin-->>MCP: task-finished / task-failed
    MCP-->>Agent: ToolResult (isError:true on timeout)
```

## Security

The plugin gives AI agents access to your open Figma document, similar to the official Figma MCP server. It runs on your local machine and does not send data anywhere else by itself — exposure depends on which AI client you connect.

- Local use is the default. For any networked use, set `CORS_ORIGIN` explicitly, review `networkAccess.allowedDomains` in `plugin/manifest.json`, and proceed at your own risk.
- `export-file`/`export-asset` writes are confined to the requested output dir (no `../` escape, no filesystem-root writes, frame count + byte caps).

Found a security issue? Please report it via GitHub issue.

## Alternatives

If your tasks are read-only, use the [official Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server).

A known community alternative built on the same plugin-plus-socket idea is [cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp) (plain JavaScript, separate socket server). Fimake differs with TypeScript, a single server (MCP + bridge on one `PORT`), and contract-tested tools.
