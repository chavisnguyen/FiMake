/**
 * "fimake install-mcp" — Register the FiMake MCP server into every supported
 * AI tool on the machine (AGY, Claude Code, Kiro, Codex, Claude Desktop, OpenCode).
 *
 * Supports two modes:
 *   fimake install-mcp           => streamable-http (default, recommended)
 *   fimake install-mcp --stdio   => stdio (spawns binary on demand per client)
 *
 * Reference: 1craft-bruse/install.sh
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config/config.js";

export type InstallMcpMode = "http" | "stdio";

export interface InstallMcpOptions {
    mode?: InstallMcpMode;
    port?: number;
    serverName?: string;
}

export interface InstallMcpResult {
    tool: string;
    path: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
}

function writeJson(filePath: string, data: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + ".tmp-" + String(process.pid);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(tmp, filePath);
}

/** Strip line comments and block comments + trailing commas so JSONC parses cleanly. */
function stripJsonc(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/[^\n]*/g, "$1")
        .replace(/,(\s*[}\]])/g, "$1");
}

function readJsonc(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
}

function getNestedObj(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
    let cur: Record<string, unknown> = obj;
    for (const k of keys) {
        if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
        cur = cur[k] as Record<string, unknown>;
    }
    return cur;
}

// ---------------------------------------------------------------------------
// Per-tool installers
// ---------------------------------------------------------------------------

function installAgy(opts: InstallMcpOptions, serverName: string, mcpUrl: string, binPath: string): InstallMcpResult {
    const filePath = path.join(process.env["HOME"] ?? "~", ".gemini", "config", "mcp_config.json");
    try {
        const data = readJson(filePath);
        const servers = getNestedObj(data, "mcpServers");
        if (opts.mode === "stdio") {
            servers[serverName] = { command: binPath };
        } else {
            servers[serverName] = { disabled: false, serverUrl: mcpUrl };
        }
        writeJson(filePath, data);
        return { tool: "AGY", path: filePath, ok: true };
    } catch (err) {
        return { tool: "AGY", path: filePath, ok: false, error: String(err) };
    }
}

function installClaudeCode(opts: InstallMcpOptions, serverName: string, mcpUrl: string, binPath: string): InstallMcpResult {
    const filePath = path.join(process.env["HOME"] ?? "~", ".claude.json");
    try {
        const data = readJson(filePath);
        const servers = getNestedObj(data, "mcpServers");
        if (opts.mode === "stdio") {
            servers[serverName] = { command: binPath };
        } else {
            servers[serverName] = { type: "http", url: mcpUrl };
        }
        writeJson(filePath, data);
        return { tool: "Claude Code", path: filePath, ok: true };
    } catch (err) {
        return { tool: "Claude Code", path: filePath, ok: false, error: String(err) };
    }
}

function installKiro(opts: InstallMcpOptions, serverName: string, mcpUrl: string, binPath: string): InstallMcpResult {
    const filePath = path.join(process.env["HOME"] ?? "~", ".kiro", "settings", "mcp.json");
    try {
        const data = readJson(filePath);
        const servers = getNestedObj(data, "mcpServers");
        if (opts.mode === "stdio") {
            servers[serverName] = { command: binPath, disabled: false };
        } else {
            servers[serverName] = { url: mcpUrl, disabled: false };
        }
        writeJson(filePath, data);
        return { tool: "Kiro", path: filePath, ok: true };
    } catch (err) {
        return { tool: "Kiro", path: filePath, ok: false, error: String(err) };
    }
}

function installCodex(opts: InstallMcpOptions, serverName: string, mcpUrl: string, binPath: string): InstallMcpResult {
    const codexDir = process.env["CODEX_HOME"] ?? path.join(process.env["HOME"] ?? "~", ".codex");
    const filePath = path.join(codexDir, "config.toml");
    try {
        fs.mkdirSync(codexDir, { recursive: true });
        let raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

        // Remove any existing [mcp_servers.<serverName>] section.
        // Build the RegExp from a string to avoid TS parser issues with nested brackets.
        const quotedName = serverName.replace(/[-/\\^$*+?.()|]/g, "\\$&");
        const sectionPattern =
            "\\[mcp_servers\\.(?:\"" + quotedName + "\"|'" + quotedName + "'|" + quotedName + ")\\][^\\[]*";
        raw = raw.replace(new RegExp(sectionPattern, "g"), "");

        // Trim trailing blank lines
        raw = raw.replace(/\n+$/, "");
        if (raw) raw += "\n\n";

        const valueLine =
            opts.mode === "stdio"
                ? "command = " + JSON.stringify(binPath)
                : "url = " + JSON.stringify(mcpUrl);
        raw += "[mcp_servers." + serverName + "]\n" + valueLine + "\n";

        const tmp = filePath + ".tmp-" + String(process.pid);
        fs.writeFileSync(tmp, raw, "utf8");
        fs.renameSync(tmp, filePath);
        return { tool: "Codex", path: filePath, ok: true };
    } catch (err) {
        return { tool: "Codex", path: filePath, ok: false, error: String(err) };
    }
}

function installClaudeDesktop(
    _opts: InstallMcpOptions,
    serverName: string,
    _mcpUrl: string,
    binPath: string,
): InstallMcpResult {
    const claudeDir = path.join(
        process.env["HOME"] ?? "~",
        "Library",
        "Application Support",
        "Claude",
    );
    const filePath = path.join(claudeDir, "claude_desktop_config.json");
    if (!fs.existsSync(claudeDir)) {
        return { tool: "Claude Desktop", path: filePath, ok: true, skipped: true };
    }
    try {
        const data = readJson(filePath);
        const servers = getNestedObj(data, "mcpServers");
        // Claude Desktop only supports stdio
        servers[serverName] = { command: binPath };
        writeJson(filePath, data);
        return { tool: "Claude Desktop", path: filePath, ok: true };
    } catch (err) {
        return { tool: "Claude Desktop", path: filePath, ok: false, error: String(err) };
    }
}

function installOpenCode(opts: InstallMcpOptions, serverName: string, mcpUrl: string, binPath: string): InstallMcpResult {
    const base = path.join(process.env["HOME"] ?? "~", ".config", "opencode");
    const candidates = [
        path.join(base, "opencode.jsonc"),
        path.join(base, "opencode.json"),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p)) ?? (candidates[1] as string);
    try {
        const data = fs.existsSync(filePath) ? readJsonc(filePath) : {};
        const servers = getNestedObj(data, "mcp", "servers");
        if (opts.mode === "stdio") {
            servers[serverName] = { type: "stdio", command: binPath };
        } else {
            servers[serverName] = { type: "remote", url: mcpUrl };
        }
        writeJson(filePath, data);
        return { tool: "OpenCode", path: filePath, ok: true };
    } catch (err) {
        return { tool: "OpenCode", path: filePath, ok: false, error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Resolve binary path (the installed fimake itself)
// ---------------------------------------------------------------------------

function resolveBinPath(): string {
    // process.argv[1] is the script/binary being executed. For a globally
    // installed npm package this is the bin wrapper; for a Homebrew install
    // it is the symlink inside the Cellar. Either way it is the right path to
    // hand to stdio-mode MCP clients.
    return process.argv[1] ?? "fimake";
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function installMcp(opts: InstallMcpOptions = {}): Promise<InstallMcpResult[]> {
    const mode = opts.mode ?? "http";
    const port = opts.port ?? config.PORT;
    const serverName = opts.serverName ?? "fimake";
    const mcpUrl = "http://localhost:" + String(port) + "/mcp";
    const binPath = resolveBinPath();

    const withMode = { ...opts, mode };

    return [
        installAgy(withMode, serverName, mcpUrl, binPath),
        installClaudeCode(withMode, serverName, mcpUrl, binPath),
        installKiro(withMode, serverName, mcpUrl, binPath),
        installCodex(withMode, serverName, mcpUrl, binPath),
        installClaudeDesktop(withMode, serverName, mcpUrl, binPath),
        installOpenCode(withMode, serverName, mcpUrl, binPath),
    ];
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

export async function runInstallMcpCli(args: string[]): Promise<number> {
    const mode: InstallMcpMode = args.includes("--stdio") ? "stdio" : "http";

    const portFlag = args.indexOf("--port");
    const portRaw = portFlag !== -1 ? args[portFlag + 1] : undefined;
    const portArg = portRaw !== undefined ? parseInt(portRaw, 10) : NaN;
    const port = isNaN(portArg) ? undefined : portArg;

    const nameFlag = args.indexOf("--name");
    const nameNext = nameFlag !== -1 ? args[nameFlag + 1] : undefined;
    const serverName =
        nameNext !== undefined && !nameNext.startsWith("--") ? nameNext : undefined;

    const modeLabel = mode === "stdio" ? "stdio" : "streamable-http";
    console.log("Configuring fimake MCP [" + modeLabel + "] mode across AI tools...\n");

    let results: InstallMcpResult[];
    try {
        const mcpOpts: InstallMcpOptions = { mode };
        if (port !== undefined) mcpOpts.port = port;
        if (serverName !== undefined) mcpOpts.serverName = serverName;
        results = await installMcp(mcpOpts);
    } catch (err) {
        console.error("Fatal error during install-mcp:", err instanceof Error ? err.message : String(err));
        return 1;
    }

    let anyFailed = false;
    for (const r of results) {
        const label = r.tool.padEnd(14);
        if (r.skipped === true) {
            console.log("   " + label + " skipped (not installed)");
        } else if (r.ok) {
            console.log("OK " + label + " " + r.path);
        } else {
            console.log("!! " + label + " " + (r.error ?? "unknown error"));
            anyFailed = true;
        }
    }

    console.log("");
    if (anyFailed) {
        console.error("Some tools failed — check the errors above.");
        return 1;
    }

    if (mode === "http") {
        console.log("Done! Restart each AI tool to pick up the new MCP config.");
        console.log("Tip: Make sure the server is running: brew services start fimake");
    } else {
        console.log("Done! Each AI tool will spawn fimake on demand (stdio mode).");
    }
    return 0;
}
