# Quickstart

You need: Figma Desktop + an MCP client (Claude Code / Cursor / Opencode / Claude Desktop). No Node, no repo clone.

## Step 1 — Install

```bash
brew tap chavisnguyen/fimake
brew install fimake
fimake install-plugin
```

`install-plugin` downloads the plugin matching your CLI and registers it with Figma Desktop (macOS). If Figma is running, it asks to quit it once — Figma only saves its plugin registry on quit.

No Homebrew? See [Usage → Without Homebrew](usage.md#without-homebrew). Not on macOS? [Install the plugin manually](troubleshooting.md#install-the-plugin-manually).

## Step 2 — Start the server

```bash
brew services start fimake
fimake doctor   # expect "[ok] server: fimake running on http://localhost:10101/mcp"
```

It runs in the background and starts again after a reboot. One server serves **all** your clients at once — Claude Code and Opencode side by side is fine.

Then in Figma: *Plugins > Development > Fimake* and **keep the window open**. It shows **Connected**.

## Step 3 — Connect your client

Every client uses the same URL: `http://localhost:10101/mcp`. Pick yours, then restart the client.

**Claude Code** — one command:

```bash
claude mcp add --transport http --scope user fimake http://localhost:10101/mcp
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "fimake": { "url": "http://localhost:10101/mcp" } } }
```

**Opencode** (`~/.config/opencode/opencode.json`):

```json
{ "mcp": { "fimake": { "type": "remote", "url": "http://localhost:10101/mcp", "enabled": true } } }
```

**Claude Desktop** (`claude_desktop_config.json`) — needs Node, it has no URL field:

```json
{ "mcpServers": { "fimake": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:10101/mcp"] } } }
```

> Already had `"command": "fimake"` in a client config from an older guide? Replace it with the URL above — a client that still spawns `fimake` fights the shared server for port `10101`.

## Verify

Ask: *"list the pages in this Figma file"*. The plugin window shows `Task started: get-pages ...` → `Task finished: ...`.

Something off? Run `fimake doctor` — it says what's wrong and what to do. More in [Troubleshooting](./troubleshooting.md).

## Update

```bash
brew upgrade fimake
fimake install-plugin
brew services restart fimake
```

The plugin and the CLI must come from the **same release** — `install-plugin` takes care of that.
