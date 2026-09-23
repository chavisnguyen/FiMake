# Fimake Usage

This is the full end-user guide. The [Quickstart](./quickstart.md) has the 5-minute version; this page covers every step in detail.

Default flow uses **`TRANSPORT=streamable-http`** (matches `mcp/.env.example`). `stdio` is documented at the end as an alternative for local-only clients.

## 1. Prerequisites

- `Node.js >= 22` and `pnpm` (`npm i -g pnpm`)
- Figma Desktop (or Figma in a browser that allows local websocket connections)
- An MCP client (Claude Desktop, Cursor, Claude Code, or the MCP Inspector)
- Clone this repository

## 2. Install and build (once)

For **users** (no clone): `brew tap chavisnguyen/fimake && brew install fimake` then `fimake --version` — update with `brew upgrade fimake`. The plugin zip must be from the same release tag (e.g. both `v1.0.32`).

For **contributors** (clone):

```bash
make install   # pnpm install at the workspace root (mcp + plugin)
make build     # builds mcp/dist + plugin/dist
```

Re-run `make build` after every `git pull` or any change under `mcp/src` / `plugin/{main,ui,shared}`.

## 3. Import the plugin into Figma (once, re-import after rebuilds)

1. Open Figma and the document you want to work with.
2. Go to *Plugins > Development > Import plugin from manifest*.
3. Select `<repo>/plugin/manifest.json`.
4. Run it via *Plugins > Development > Fimake*.
5. Expected: the plugin window shows **Not connected to MCP server**.
6. **Keep the plugin window open.** It flips to **Connected to MCP server** once the server in step 4 is running.

Next launches: *Plugins > Development > Fimake* (no re-import needed unless you rebuilt the plugin).

**Alternative: `fimake install-plugin`.** On macOS, this does steps 2–3 for you — download+verify a released plugin zip, or (with `--dir`) register your own local `plugin/` build in place without touching it:

```bash
fimake install-plugin --dir plugin   # contributor: register the local build you just made
fimake install-plugin                # user: download the latest release's plugin instead
```

| Flag | Effect |
|---|---|
| `--dir <path>` | Where to install. Default `~/.fimake/plugin/<version>/`. If `<path>` already holds a valid FiMake build (e.g. `plugin/` after `make build`), it's registered in place — no download. |
| `--no-register` | Download/verify (or reuse `--dir`) only; don't touch Figma or `settings.json`. Prints the manifest path for you to Import manually. |
| `--version-tag <vX.Y.Z>` | Download a specific release tag instead of the version matching your installed `fimake` binary. |
| `--yes` / `-y` | Skip the "quit Figma?" confirmation prompt (still a graceful `osascript` quit, never a force-kill) — for scripts/CI. |

If Figma is running when you register, `install-plugin` asks to quit it for you first (Figma only writes `settings.json` on quit). Not on macOS? Use `--no-register` and the manual steps above.

## 4. Start the MCP server

```bash
cp mcp/.env.example mcp/.env   # first time only, then edit if needed
cd mcp && pnpm start            # TRANSPORT comes from mcp/.env (streamable-http)
```

Expected console output:

```text
[fimake] Server listening on http://localhost:10101
```

The same `PORT` serves both the MCP endpoint (`/mcp`) and the Socket.IO bridge the plugin connects to. Confirm it works:

```bash
curl http://localhost:10101/health   # -> {"ok":true}
```

Leave this terminal running. Start the Figma plugin (step 3) afterwards — or before, order does not matter as long as both end up running.

## 5. Connect your AI client (streamable-http)

Point the client at `http://localhost:10101/mcp` (replace `10101` with your `PORT`). Three common shapes:

**Generic HTTP client / Claude Code / Inspector:**

```json
{
  "mcpServers": {
    "fimake": { "url": "http://localhost:10101/mcp" }
  }
}
```

**Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "fimake": { "url": "http://localhost:10101/mcp" }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`) — HTTP:**

```json
{
  "mcpServers": {
    "fimake": { "url": "http://localhost:10101/mcp" }
  }
}
```

Then restart the client if it requires it, enable the `fimake` tools you need (disable the rest), and ask something like *"list the pages in this Figma file"*. The plugin window should show the task appear and settle (e.g. `Task started: get-pages ...` → `Task finished: ...`).

## 6. Environment (`mcp/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `TRANSPORT` | `stdio` (code) / `streamable-http` (shipped `.env.example`) | `streamable-http` is the documented flow (Inspector + HTTP clients). |
| `PORT` | `10101` | Serves `/mcp` **and** the plugin Socket.IO bridge. |
| `TASK_TIMEOUT_MS` | `20000` | Tool call → plugin round-trip budget. |
| `TASK_ACK_TIMEOUT_MS` | `5000` | Socket ack budget; unacked sends are queued for retry on reconnect. |
| `CORS_ORIGIN` | `*` | Local dev only. Set explicitly for any networked use. |
| `JSON_BODY_LIMIT` | `1mb` | Max JSON body on `/mcp`. |
| `DEBUG=1` | off | Verbose wire logging. Task lifecycle lines (`task added/completed/failed/timed out`) always log as `[fimake]`; plugin side logs `[fimake]` in the Figma developer console (`PLUGIN_DEBUG` in `plugin/main/debug.ts`). |

## 7. Custom `PORT`

1. Set `PORT` in `mcp/.env` and restart the server.
2. Update every `localhost:10101` entry in `plugin/manifest.json` (`networkAccess.allowedDomains` + `devAllowedDomains`) to the new port.
3. Rebuild and **re-import** the plugin in Figma: `make build`, then *Plugins > Development > Import plugin from manifest* again.
4. Point the AI client at `http://localhost:<PORT>/mcp`.

The plugin UI also accepts `?port=<PORT>` / `?socketUrl=<url>` overrides via `resolveSocketUrl()` (`plugin/ui/domain/tasks.ts`), but the manifest allowlist is still required — so treat the query override as a dev escape hatch, not the normal path.

## 8. `stdio` alternative (local-only clients)

Some clients only speak stdio. This still works: the server speaks stdio to the client **and** opens the same `PORT` for the plugin's Socket.IO bridge.

```json
{
  "mcpServers": {
    "fimake": {
      "command": "node",
      "args": ["/absolute/path/to/fimake/mcp/dist/index.js"],
      "env": { "TRANSPORT": "stdio", "PORT": "10101" }
    }
  }
}
```

Console output in this mode is `Socket.IO server listening on http://localhost:<PORT>` (no `/mcp` endpoint). The Figma plugin setup (step 3) is unchanged. If the client supports HTTP, prefer section 5.

## 9. Publishing note

Fimake is currently distributed as a **dev plugin** (import from manifest). Once Figma approves a published listing, steps 2–3 collapse to "install from the Figma plugin page". Until then, re-import from manifest after each plugin rebuild.

Stuck? See [troubleshooting](troubleshooting.md). Changing code? See [development](development.md).
