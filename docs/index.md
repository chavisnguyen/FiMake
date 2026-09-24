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
      text: Tools reference
      link: /tools

features:
  - icon: "🎨"
    title: Write, not just read
    details: 35 tools — create frames, text, components, colors, layout, and more. The official MCP server can't change anything; Fimake can.
  - icon: "🔌"
    title: 3 steps to running
    details: brew install fimake, fimake install-plugin, paste one MCP config block. Your client spawns the server — you run nothing by hand.
  - icon: "🛡️"
    title: Local by default
    details: One port (10101) bridges the MCP server and the Figma plugin on your own machine. Nothing leaves except through the AI client you choose.
---

## How it works

1. **`brew install fimake`** — the CLI (no Node needed).
2. **`fimake install-plugin`** — registers the Figma dev plugin; keep its window open in Figma.
3. **Paste one MCP config block** — your client spawns the server; ask *“list the pages in this Figma file”*.

```bash
brew tap chavisnguyen/fimake && brew install fimake
fimake install-plugin
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

> New here? Follow [Quickstart](/quickstart). Stuck? Run `fimake doctor`, then see [Troubleshooting](/troubleshooting).

## Go deeper

- [Usage](/usage) — env vars, custom `PORT`, HTTP mode.
- [Tools](/tools) — all 35 tools and multi-window targeting.
- [Architecture](/architecture) — bridge, diagrams, security.
- [Development](/development) — contributors: `make` targets, watch mode, tests.
