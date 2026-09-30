# Fimake

[![release](https://img.shields.io/github/v/release/chavisnguyen/FiMake)](https://github.com/chavisnguyen/FiMake/releases)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

The official Figma MCP server is read-only. **Fimake lets AI agents work directly in your Figma documents** — create, edit, organize, and read.

📖 **Docs:** [chavisnguyen.github.io/FiMake](https://chavisnguyen.github.io/FiMake)

## Install

You need: Figma Desktop + an MCP client. No Node, no repo clone.

```bash
brew tap chavisnguyen/fimake
brew install fimake
fimake install-plugin        # downloads + registers the Figma plugin (macOS)
brew services start fimake   # one shared server in the background
```

Open Figma → *Plugins > Development > Fimake* and **keep the window open** (it shows **Connected**).

Point your MCP client at `http://localhost:10101/mcp` and restart it. Claude Code:

```bash
claude mcp add --transport http --scope user fimake http://localhost:10101/mcp
```

Cursor / Opencode / Claude Desktop: see [Quickstart](docs/quickstart.md). Several clients can use the same server at once.

Then ask *"list the pages in this Figma file"*. Stuck? Run `fimake doctor` — see [Troubleshooting](docs/troubleshooting.md).

No Homebrew? See [Usage](docs/usage.md#without-homebrew). Building from source? See [Development](docs/development.md).

## Tools

35 tools: 28 forward directly to the plugin (`name` = task command), 7 have extra Node-side logic. Full list: [docs/tools.md](docs/tools.md).
