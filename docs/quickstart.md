# Quickstart

You need: Figma Desktop + an MCP client (Claude Code / Cursor / Claude Desktop / Opencode). No Node, no repo clone.

## Step 1 — Install the CLI

```bash
brew tap chavisnguyen/fimake
brew install fimake
fimake --version
fimake doctor   # expect "[ok] port ... is free"
```

No Homebrew? Download `fimake-<your-os>` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases), `chmod +x` it, and use its full path wherever you see `fimake` below. Update later with `brew upgrade fimake`.

## Step 2 — Install the Figma plugin (once)

```bash
fimake install-plugin
```

This downloads the plugin matching your CLI version and registers it with Figma Desktop (macOS). If Figma is running, it asks to quit it once — Figma only saves its plugin registry on quit. Flags: `--yes` skips the prompt, `--no-register` downloads only (you import manually).

Then:

1. Reopen Figma → *Plugins > Development > Fimake*. Expected: **Not connected to MCP server**.
2. **Keep this window open.** It flips to **Connected** once your client spawns the server (step 3).

> Plugin zip and CLI must come from the **same release**. Not on macOS? See [manual sideload](troubleshooting.md#install-the-plugin-manually).

## Step 3 — Connect your client

Your client spawns the server itself — **run nothing by hand**. Pick your client, paste, restart it if it requires:

**Claude Code / Cursor (`~/.cursor/mcp.json`) / Claude Desktop** — same shape:

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

**Opencode** (`~/.config/opencode/opencode.json`) — different shape, same idea:

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

Using a standalone binary instead of brew? Replace `"command": "fimake"` with the absolute binary path.

## Verify it works

Ask: *"list the pages in this Figma file"*. The plugin window should show `Task started: get-pages ...` → `Task finished: ...`.

- Port conflict / second server crashing? Run `fimake doctor` — it tells you which process holds port `10101`.
- Still stuck? See [Troubleshooting](./troubleshooting.md).
- Need env vars, a custom `PORT`, or HTTP mode? See [Usage](./usage.md).
- Building from source? See [Development](./development.md).
