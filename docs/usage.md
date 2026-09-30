# Fimake Usage

Default setup: **one shared server** (`brew services start fimake`, `TRANSPORT=streamable-http`) that every MCP client reaches at `http://localhost:10101/mcp`. Follow [Quickstart](./quickstart.md) first — this page covers what comes after.

## One server per machine

Only one Fimake server can own port `10101` (the Figma plugin connects there). With the shared server running, every client must use the URL — a client config with `"command": "fimake"` spawns a second server that crashes on the port. When in doubt: `fimake doctor`.

```bash
brew services start fimake     # start (and on every login)
brew services restart fimake   # after brew upgrade / env changes
brew services stop fimake      # stop
tail -f "$(brew --prefix)/var/log/fimake.log"   # server logs
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TRANSPORT` | `stdio` (binary) · `streamable-http` (`brew services`) | `streamable-http`: one server, clients connect to `/mcp`. `stdio`: each client spawns its own server ([below](#stdio-single-client)). |
| `PORT` | `10101` | One port serves the MCP endpoint (`/mcp`) **and** the plugin Socket.IO bridge. |
| `TASK_TIMEOUT_MS` | `20000` | Tool call → plugin round-trip budget. Raise for huge `get-node-info` calls. |
| `TASK_ACK_TIMEOUT_MS` | `5000` | Socket ack budget; unacked sends are queued for retry on reconnect. |
| `CORS_ORIGIN` | `*` | `*` = localhost only (other machines and web pages are refused). Set a real origin only for [networked use](./troubleshooting.md#networked-non-localhost-use). |
| `JSON_BODY_LIMIT` | `1mb` | Max JSON body on `/mcp`. |
| `DEBUG=1` | off | Verbose wire logging. Task lifecycle lines always log as `[fimake]`. |

## Without Homebrew

Download `fimake-<your-os>` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases), `chmod +x` it, and run it yourself (keep the terminal open):

```bash
TRANSPORT=streamable-http ./fimake-macos-arm64
curl http://localhost:10101/health   # -> {"ok":true,...}
```

Clients connect exactly as in [Quickstart step 3](./quickstart.md).

## Custom `PORT`

1. Set `PORT` in your client config (`env`) and restart the client.
2. Update every `localhost:10101` entry in `plugin/manifest.json` (`networkAccess.allowedDomains` + `devAllowedDomains`) to the new port.
3. Rebuild and **re-import** the plugin: `make build`, then *Plugins > Development > Import plugin from manifest* again.

## `stdio` (single client)

Only if you use **one** client and don't want a background server: stop the service (`brew services stop fimake`) and let the client spawn Fimake itself:

```json
{
  "mcpServers": {
    "fimake": { "command": "fimake", "env": { "TRANSPORT": "stdio" } }
  }
}
```

A second stdio client at the same time crashes on port `10101` — switch back to the shared server for that.

## Re-installing / updating

```bash
brew upgrade fimake
fimake install-plugin          # re-registers the matching plugin version
brew services restart fimake
fimake doctor                  # confirms server + plugin registration
```

The plugin zip and the CLI must always come from the **same release**.

## Publishing note

Fimake ships as a **dev plugin** (sideload from manifest) because it needs a local socket bridge (`localhost:10101`), which Figma doesn't allow for published listings. Until that changes, re-import from manifest after each plugin rebuild (contributors — see [Development](./development.md)).

Stuck? See [Troubleshooting](./troubleshooting.md).
