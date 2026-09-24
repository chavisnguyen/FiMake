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
fimake install-plugin   # downloads + registers the Figma plugin (macOS)
```

Then reopen Figma → *Plugins > Development > Fimake* and **keep the window open**. It flips to **Connected** once your client spawns the server below.

Add this to your MCP config and restart the client:

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

Then ask *"list the pages in this Figma file"*. Stuck? Run `fimake doctor` — see [Troubleshooting](docs/troubleshooting.md).

No Homebrew / not on macOS / another client? See [Quickstart](docs/quickstart.md). Building from source? See [Development](docs/development.md).

## Tools

35 tools: 28 forward directly to the plugin (`name` = task command), 7 have extra Node-side logic. Full list: [docs/tools.md](docs/tools.md).
