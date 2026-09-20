---
layout: home

hero:
  name: "FiMake"
  text: "AI agents inside your Figma documents"
  tagline: The official Figma MCP server is read-only. Fimake lets agents create, edit, organize, and read — directly in the file you have open.
  actions:
    - theme: brand
      text: Get started (5 min)
      link: /quickstart
    - theme: alt
      text: Full usage guide
      link: /usage
    - theme: alt
      text: Tools reference
      link: /tools

features:
  - icon: "🎨"
    title: Write, not just read
    details: 27 tools — create frames, rectangles, text, components, instances, prototype links, colors, layout, and more. The official MCP server can't change anything; Fimake can.
  - icon: "🔌"
    title: One port, two transports
    details: A single Hono + Socket.IO server on PORT 10101 serves the MCP endpoint (/mcp) and the Figma plugin bridge. stdio for local clients, streamable-http for Inspector and HTTP clients.
  - icon: "🛡️"
    title: Contract-tested parity
    details: 23 tools forward directly to the plugin, 4 have Node-side logic. Parity is enforced by mcp/tests/contract/mcp-tools.test.ts so agents never hit a ghost tool.
---

## How it works

1. **Sideload the dev plugin** in Figma (`fimake-plugin.zip` from [GitHub Releases](https://github.com/chavisnguyen/FiMake/releases)) and keep its window open.
2. **Run the MCP server** — `brew install fimake` (or standalone binary, no Node needed) or from source.
3. **Point your client** (Claude Code / Cursor / Claude Desktop / Inspector) at Fimake and ask, e.g. *“list the pages in this Figma file”*.

```bash
brew tap chavisnguyen/fimake && brew install fimake
```

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

> Prefer direct download? Use `fimake-macos-arm64` etc. from Releases with `command: "/absolute/path/to/fimake-macos-arm64"`.

> New here? Follow [Quickstart](/quickstart) (5 minutes), then [Usage](/usage) for HTTP configs, env table, and custom `PORT`. Stuck? See [Troubleshooting](/troubleshooting).

## Go deeper

- [Tools (27)](/tools) — every tool, which side runs it, and what it does.
- [Architecture](/architecture) — bridge, task map, ack + retry, sequence diagrams.
- [Development](/development) — contributor guide: `make` targets, watch mode, tests, releases.
