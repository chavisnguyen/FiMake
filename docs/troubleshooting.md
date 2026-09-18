# Fimake Troubleshooting

## Plugin shows "Not connected to MCP server"

1. Is the server running? You should see `[fimake] Server listening on http://localhost:<PORT>` (streamable-http) or `Socket.IO server listening …` (stdio).
2. Is the plugin window open? Figma suspends closed plugins — keep it open.
3. Wrong port? Check `PORT` in `mcp/.env` vs the URL the plugin uses (`ws://localhost:<PORT>`, shown in the plugin footer). If you changed `PORT`, follow [usage → custom PORT](usage.md#7-custom-port) (manifest + rebuild + re-import).
4. Still stuck? Restart in order: server first, then *Plugins > Development > Fimake*.

## `curl /health` fails / port already in use

```bash
curl http://localhost:10101/health   # expect {"ok":true}
lsof -i :10101                       # find the process holding the port
```

Either stop the other process or set a new `PORT` in `mcp/.env` (then follow the custom-PORT checklist — the plugin manifest hardcodes the port).

## Client (Claude/Cursor) does not see tools

- Confirm the client config points at `http://localhost:<PORT>/mcp` (streamable-http mode) and the server was started with `TRANSPORT=streamable-http`.
- Restart the client after editing its MCP config — most clients only read it at launch.
- Try the Inspector first to isolate client vs server: `cd mcp && pnpm inspector`, connect to `http://127.0.0.1:<PORT>/mcp`.
- Disable tools you do not need; some clients cap the tool count.

## Task times out (`isError:true`, "Task timed out")

- The plugin has `TASK_TIMEOUT_MS` (default 20000ms) to reply. Large `get-node-info` calls on huge files are the usual cause — retry with smaller `depth` / `maxNodes` / `maxChars`, or raise `TASK_TIMEOUT_MS` in `mcp/.env`.
- Check the plugin is on the right document/page and Figma is not showing a modal dialog (plugin code cannot run while a native dialog is open).
- Watch both consoles: server `[fimake] task added/completed/failed/timed out` lines tell you which hop swallowed the task; plugin `[fimake]` lines appear in *Plugins > Development > Open Console*.

## Changed code but nothing changed in Figma

- You edited `mcp/src`: restart `pnpm start` (or run `pnpm dev` for watch mode).
- You edited `plugin/{main,ui,shared}` or `plugin/manifest.json`: run `make build`, then **re-import** the plugin (*Import plugin from manifest* again) and re-run it. Figma caches the old bundle otherwise.

## Noisy / missing logs

- Server wire payloads: `DEBUG=1 cd mcp && pnpm start`.
- Plugin verbose: `PLUGIN_DEBUG` in `plugin/main/debug.ts` (Figma developer console).
- Lifecycle lines (`task added/completed/failed/timed out` as `[fimake]`) always print — the last `task added` without a matching settle tells you which hop to investigate.

## Networked (non-localhost) use

Set `CORS_ORIGIN` explicitly in `mcp/.env`, review `networkAccess.allowedDomains` in `plugin/manifest.json`, and treat it as untrusted-network exposure done at your own risk. `export-file`/`export-asset` writes stay confined to the requested output dir (no `../` escape, frame count + byte caps).
