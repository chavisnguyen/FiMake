# Fimake Development

For everyday use, start with [usage](usage.md). This page is for contributors changing code.

## Unified commands

All workflows go through the root `Makefile` (which delegates to `mcp` + `plugin`):

```bash
make install     # pnpm install (workspace root covers mcp + plugin)
make typecheck   # mcp vitest typecheck + plugin tsc (main + ui + tests)
make lint        # eslint in both packages
make test        # vitest suites in both packages
make build       # production builds (mcp/dist + plugin/dist)
make check       # typecheck + lint + test + build (pre-push gate)
make dev-mcp     # watch + restart the MCP server (cd mcp && pnpm dev)
make dev-plugin  # watch + rebuild the plugin (cd plugin && pnpm dev)
make clean       # remove build outputs and coverage
```

## Layout

- `mcp/src/index.ts` — entrypoint; picks `TRANSPORT` (`stdio` vs `streamable-http`).
- `mcp/src/bridge/` — `TaskManager` (timeouts), `Orchestrator`, `createMcpServer` (tool registration).
- `mcp/src/transport/` — `stdio.ts`, `streamable-http.ts` (`/mcp` + `/health`), `socket-server.ts`, `socket-manager.ts` (ack + retry queue), `mcp-sessions.ts` (one `McpServer` per client session over a shared Figma bridge).
- `mcp/src/tools/`, `mcp/src/config/`, `mcp/src/shared/log.ts` (`[fimake]` prefix).
- `plugin/main/` — Figma sandbox: `TOOL_HANDLERS` dispatch, `TOOL_HANDLERS` run the Figma API, reply `task-finished` / `task-failed`.
- `plugin/ui/` — React status pill + console (`resolveSocketUrl()` defaults to `ws://localhost:10101`, honors `?socketUrl=` / `?port=`).
- `plugin/shared/` — zod schemas shared by both sides.
- `plugin/manifest.json` — dev-plugin manifest; `networkAccess.allowedDomains` must cover the server `PORT`.

## Watch mode

```bash
# terminal 1 — server
make dev-mcp        # or: cd mcp && pnpm dev
# terminal 2 — plugin
make dev-plugin     # or: cd plugin && pnpm dev
```

After a plugin rebuild, **re-import** it in Figma (*Plugins > Development > Import plugin from manifest*, select `plugin/manifest.json`) and re-run — Figma does not hot-reload the bundle.

## Inspector

```bash
cd mcp
pnpm inspector      # then connect to http://127.0.0.1:10101/mcp (or your PORT)
```

Requires `TRANSPORT=streamable-http` in `mcp/.env` (the shipped `.env.example` already sets it). The code default is `stdio`, which has no `/mcp` endpoint.

## Tests

```bash
make test                          # both suites
cd mcp && pnpm test                # 101 tests: contract (tools, hardening, sessions)
cd plugin && pnpm test             # 90 tests: dispatch parity, serialization, UI
cd mcp && pnpm test:typecheck      # tsc over tests
cd plugin && pnpm tsc              # tsc over main + ui + tests
```

Tool parity is enforced by `mcp/tests/contract/mcp-tools.test.ts` and `NODE_ONLY_TOOLS` in `mcp/src/tools/registry.ts`: 23 tools forward to the plugin, 4 have Node-side logic (`get-selection`, `create-image`, `export-asset`, `export-file`).

## Release

Releases ship **standalone binaries + the sideload plugin zip, no npm**. Creating a GitHub Release (tag, e.g. `v1.0.0`) triggers `.github/workflows/release.yml`: gate (`make check`), then `make package-plugin` → `fimake-plugin.zip`, then one `caxa` binary per OS (`fimake-macos-arm64`, `fimake-macos-x64`, `fimake-linux-x64`) — all attached to the Release automatically. Homebrew users get the update via the tap bump workflow.
