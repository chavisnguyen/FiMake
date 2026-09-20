# Quickstart (5 minutes, no repo clone)

Prerequisites: `Node.js >= 22`, Figma Desktop, an MCP client (Claude Code / Cursor / Claude Desktop).

## 1. Install the Figma plugin (sideload, once)

Fimake ships as a **dev plugin** (sideload from manifest). There is no Figma Community listing — the plugin needs a local socket bridge (`localhost:10101`), which Figma does not allow for published listings.

1. Download `fimake-plugin.zip` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases) and unzip it.
2. In Figma: *Plugins > Development > Import plugin from manifest*, select `manifest.json` from the unzipped folder.
3. Run it via *Plugins > Development > Fimake*. Expected: **Not connected to MCP server**.
4. **Keep the plugin window open.** It flips to **Connected** once the MCP server (step 2) is running.

> Compatibility: use the plugin zip and the binary from the **same release** (e.g. both `v1.0.x`). Default port is `10101` on both sides.

## 2. Run the MCP server (pick one)

**A. Standalone binary (recommended, no Node needed).** Download `fimake-<your-os>` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases) (`fimake-macos-arm64`, `fimake-macos-x64`, `fimake-linux-x64`), make it executable (`chmod +x fimake-*` on macOS/Linux), then point your client at it:

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

## 3. Next steps

- [Full usage guide](./usage.md) — HTTP + `stdio` configs, env table, custom `PORT`.
- [Troubleshooting](./troubleshooting.md) — `Not connected`, port in use, timeouts, logs.
- [Tools](./tools.md) — what each of the 27 tools does.

## Alternative: `streamable-http` (advanced)

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
