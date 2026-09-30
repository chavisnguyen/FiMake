# Fimake Troubleshooting

## Install the plugin manually

Use this when `fimake install-plugin` doesn't work for you: you're not on macOS, Figma's internal settings format changed, or you'd rather not let the CLI quit Figma for you. You can also run `fimake install-plugin --no-register` to have it download + unzip the plugin for you and stop there — then just do step 2 below.

1. Download `fimake-plugin.zip` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases) and unzip it.
2. In Figma: *Plugins > Development > Import plugin from manifest*, select `manifest.json` from the unzipped folder.
3. Run it via *Plugins > Development > Fimake*. Expected: **Not connected to MCP server**.
4. **Keep the plugin window open.** It flips to **Connected** once the server is running (`brew services start fimake`, see [quickstart](quickstart.md) step 2).

> Compatibility: use the plugin zip and the binary from the **same release** (e.g. both `v1.0.x`). Default port is `10101` on both sides.

## Start here: `fimake doctor`

It checks the server and the plugin without starting anything, and prints what to do:

| Doctor says | Meaning | Fix |
|---|---|---|
| `[ok] server: fimake running on …/mcp` | All good on the server side. | — |
| `nothing on port 10101` | Server isn't running. | `brew services start fimake` |
| `held by a fimake server an MCP client spawned via stdio` | A client still has `"command": "fimake"` and spawned its own server, blocking the shared one. | Change that client to `http://localhost:10101/mcp` ([quickstart](quickstart.md) step 3), restart it, then `brew services restart fimake`. |
| `not a fimake server` / `could not probe` | Another app holds port `10101`. | `lsof -i :10101`, stop it. |
| `plugin: not registered` | Figma doesn't know the plugin. | `fimake install-plugin` |

## Plugin shows "Not connected to MCP server"

1. Run `fimake doctor` — the server must show `[ok]`.
2. Is the plugin window open? Figma suspends closed plugins — keep it open.
3. Custom `PORT`? The plugin only knows `ws://localhost:10101` (shown in its footer) — follow [usage → custom PORT](usage.md#custom-port) (manifest + rebuild + re-import).
4. Still stuck? `brew services restart fimake`, then re-run *Plugins > Development > Fimake*.

## Client (Claude/Cursor/Opencode) does not see tools

- `fimake doctor` shows `[ok] server`?
- The client config points at `http://localhost:10101/mcp` — the shape differs per client, copy it from [quickstart](quickstart.md) step 3.
- Restart the client after editing its MCP config — most clients only read it at launch.
- Server logs: `tail -f "$(brew --prefix)/var/log/fimake.log"`.
- Isolate client vs server with the Inspector: `cd mcp && pnpm inspector`, connect to `http://127.0.0.1:10101/mcp`.
- Disable tools you do not need; some clients cap the tool count.

## "Port 10101 is already in use"

Two servers can't share the port. Usual causes: the shared server (`brew services`) is running **and** a client still spawns `fimake` via stdio; two stdio clients at once; or a hand-started `pnpm start` / `./fimake-…`. `fimake doctor` tells you which.

Fix: keep exactly one server — the shared one — and point every client at `http://localhost:10101/mcp`.

## Task times out (`isError:true`, "Task timed out")

- The plugin has `TASK_TIMEOUT_MS` (default 20000ms) to reply. Large `get-node-info` calls on huge files are the usual cause — retry with smaller `depth` / `maxNodes` / `maxChars`, or raise `TASK_TIMEOUT_MS` (client config `env`, or `mcp/.env` when running from source).
- Check the plugin is on the right document/page and Figma is not showing a modal dialog (plugin code cannot run while a native dialog is open).
- Watch both consoles: server `[fimake] task added/completed/failed/timed out` lines tell you which hop swallowed the task; plugin `[fimake]` lines appear in *Plugins > Development > Open Console*.

## Changed code but nothing changed in Figma (contributors)

- You edited `mcp/src`: restart `pnpm start` (or run `pnpm dev` for watch mode).
- You edited `plugin/{main,ui,shared}` or `plugin/manifest.json`: run `make build`, then **re-import** the plugin (*Import plugin from manifest* again) and re-run it. Figma caches the old bundle otherwise.

## Noisy / missing logs (contributors)

- Server wire payloads: `DEBUG=1 cd mcp && pnpm start`.
- Plugin verbose: `PLUGIN_DEBUG` in `plugin/main/debug.ts` (Figma developer console).
- Lifecycle lines (`task added/completed/failed/timed out` as `[fimake]`) always print — the last `task added` without a matching settle tells you which hop to investigate.

## Networked (non-localhost) use

By default the server only accepts connections from this machine, and `/mcp` refuses requests from web pages on other sites. Setting `CORS_ORIGIN` to a real origin lifts the localhost-only restriction — set it explicitly (client config `env`, or `mcp/.env` from source), review `networkAccess.allowedDomains` in `plugin/manifest.json`, and treat it as untrusted-network exposure done at your own risk. `export-file`/`export-asset` writes stay confined to the requested output dir (no `../` escape, frame count + byte caps).
