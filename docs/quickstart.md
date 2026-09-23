# Quickstart (5 minutes, no repo clone)

Prerequisites: Figma Desktop, an MCP client (Opencode / Claude Code / Cursor / Claude Desktop).

> Pick **one** way to run the server: either your client spawns it (`stdio`, recommended below) **or** you run it by hand (`streamable-http`, advanced). Never both — two servers fight over port `10101` and the second one crashes. When in doubt, run `fimake doctor`.

## 1. Install the Figma plugin (sideload, once)

Fimake ships as a **dev plugin** (sideload from manifest). There is no Figma Community listing — the plugin needs a local socket bridge (`localhost:10101`), which Figma does not allow for published listings.

1. Download `fimake-plugin.zip` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases) and unzip it.
2. In Figma: *Plugins > Development > Import plugin from manifest*, select `manifest.json` from the unzipped folder.
3. Run it via *Plugins > Development > Fimake*. Expected: **Not connected to MCP server**.
4. **Keep the plugin window open.** It flips to **Connected** once the MCP server (step 2) is running.

> Compatibility: use the plugin zip and the binary from the **same release** (e.g. both `v1.0.x`). Default port is `10101` on both sides.

## 2. Run the MCP server (client spawns it — you do nothing)

With `stdio` (below) your client starts the server itself. **Do NOT run the server by hand** (`pnpm start`, `node dist/index.js`, `./fimake-...`) — a hand-started server holds port `10101` and your client's own server crashes into it.

**A. Homebrew (macOS / Linux, recommended).** No Node needed — tap is auto-bumped on every release (`homebrew-fimake:Formula/fimake.rb:1`):

```bash
brew tap chavisnguyen/fimake
brew install fimake
fimake --version   # should match the plugin zip version
fimake doctor      # expect "[ok] port ... is free"
```

Update with `brew upgrade fimake`.

**B. Standalone binary (no Node needed).** Download `fimake-<your-os>` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases) (`fimake-macos-arm64`, `fimake-macos-x64`, `fimake-linux-x64`), make it executable (`chmod +x fimake-*` on macOS/Linux).

Point your client at it (replace the `command` with your binary path for option B):

**Opencode** (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "fimake": {
      "type": "local",
      "command": ["fimake"],
      "enabled": true,
      "environment": { "TRANSPORT": "stdio", "PORT": "10101" }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json` or project `.cursor/mcp.json`), **Claude Code / generic clients:**

```json
{
  "mcpServers": {
    "fimake": {
      "command": "fimake",
      "env": { "TRANSPORT": "stdio", "PORT": "10101" }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): same `mcpServers` block as above.

Then restart the client if it requires it and ask something like *"list the pages in this Figma file"*. The plugin window should show the task appear and settle (`Task started: get-pages ...` → `Task finished: ...`).

> Contributors run from source instead: `git clone https://github.com/chavisnguyen/FiMake.git && cd FiMake && make install && make build`, then point the client at `node /absolute/path/to/FiMake/mcp/dist/index.js` (needs `Node.js >= 22`). Full workflow in [development](./development.md).

## 3. Next steps

- [Full usage guide](./usage.md) — HTTP + `stdio` configs, env table, custom `PORT`.
- [Troubleshooting](./troubleshooting.md) — `Not connected`, port in use, timeouts, logs.
- [Tools](./tools.md) — what each of the 29 tools does.

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
