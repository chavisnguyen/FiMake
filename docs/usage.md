# Fimake Usage

Default setup is **`TRANSPORT=stdio`**: your MCP client spawns the server, you run nothing by hand. Follow [Quickstart](./quickstart.md) first — this page covers what comes after.

## Never run two servers

Pick **one**: client spawns the server (`stdio`, default) **or** you run it yourself (`streamable-http`, [advanced](#streamable-http-advanced)). Never both — two servers fight over port `10101` and the second one crashes. When in doubt: `fimake doctor`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TRANSPORT` | `stdio` | `stdio` (client spawns it) or `streamable-http` (you run it, client connects over HTTP). |
| `PORT` | `10101` | One port serves the MCP endpoint (`/mcp`, HTTP mode) **and** the plugin Socket.IO bridge. |
| `TASK_TIMEOUT_MS` | `20000` | Tool call → plugin round-trip budget. Raise for huge `get-node-info` calls. |
| `TASK_ACK_TIMEOUT_MS` | `5000` | Socket ack budget; unacked sends are queued for retry on reconnect. |
| `CORS_ORIGIN` | `*` | Local dev only. Set explicitly for any networked use. |
| `JSON_BODY_LIMIT` | `1mb` | Max JSON body on `/mcp`. |
| `DEBUG=1` | off | Verbose wire logging. Task lifecycle lines always log as `[fimake]`. |

## Custom `PORT`

1. Set `PORT` in your client config (`env`) and restart the client.
2. Update every `localhost:10101` entry in `plugin/manifest.json` (`networkAccess.allowedDomains` + `devAllowedDomains`) to the new port.
3. Rebuild and **re-import** the plugin: `make build`, then *Plugins > Development > Import plugin from manifest* again.

## `streamable-http` (advanced)

Use this only if your client requires an HTTP endpoint (or you want the Inspector over HTTP). You run the server yourself and point the client at a URL:

```bash
TRANSPORT=streamable-http fimake
# serves http://localhost:10101/mcp
curl http://localhost:10101/health   # -> {"ok":true}
```

```json
{
  "mcpServers": {
    "fimake": { "url": "http://localhost:10101/mcp" }
  }
}
```

Leave that terminal running, and keep the Figma plugin window open — order doesn't matter as long as both end up running.

## Re-installing / updating

```bash
brew upgrade fimake
fimake install-plugin   # re-registers the matching plugin version
fimake doctor           # confirms port + plugin registration
```

The plugin zip and the CLI must always come from the **same release**.

## Publishing note

Fimake ships as a **dev plugin** (sideload from manifest) because it needs a local socket bridge (`localhost:10101`), which Figma doesn't allow for published listings. Until that changes, re-import from manifest after each plugin rebuild (contributors — see [Development](./development.md)).

Stuck? See [Troubleshooting](./troubleshooting.md).
