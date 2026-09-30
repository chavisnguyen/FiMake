---
layout: home

hero:
  name: "FiMake"
  text: "AI agents inside your Figma documents"
  tagline: The official Figma MCP server is read-only. Fimake lets agents create, edit, organize, and read — directly in the file you have open.
  actions:
    - theme: brand
      text: Get started
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
    details: brew install fimake, brew services start fimake, add one URL to your client. One background server for all your clients.
  - icon: "🛡️"
    title: Local by default
    details: One port (10101) on localhost bridges the MCP server and the Figma plugin — other machines and web pages can't reach it. Nothing leaves except through the AI client you choose.
---

## How it works

1. **`brew install fimake && fimake install-plugin`** — the CLI (no Node needed) + the Figma dev plugin; keep its window open in Figma.
2. **`brew services start fimake`** — one shared server in the background.
3. **Add `http://localhost:10101/mcp` to your client** — then ask *“list the pages in this Figma file”*.

```bash
brew tap chavisnguyen/fimake && brew install fimake
fimake install-plugin
brew services start fimake
claude mcp add --transport http --scope user fimake http://localhost:10101/mcp   # Claude Code
```

> New here? Follow [Quickstart](/quickstart). Stuck? Run `fimake doctor`, then see [Troubleshooting](/troubleshooting).

## Go deeper

- [Usage](/usage) — env vars, custom `PORT`, stdio mode.
- [Tools](/tools) — all 35 tools and multi-window targeting.
- [Architecture](/architecture) — bridge, diagrams, security.
- [Development](/development) — contributors: `make` targets, watch mode, tests.
