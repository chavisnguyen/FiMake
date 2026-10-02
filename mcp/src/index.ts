#!/usr/bin/env node
import { config } from "./config/config";
import { SERVER_VERSION } from "./bridge/server";
import { startSTDIO } from "./transport/stdio";
import { startStreamableHTTP } from "./transport/streamable-http";

// Lightweight flag for `fimake --version` (brew test, users). Exits before
// any transport or socket is opened. Version is single-sourced from
// mcp/package.json via SERVER_VERSION (see bridge/server.ts).
const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-V")) {
    console.log(SERVER_VERSION);
    process.exit(0);
}

// `fimake --help` / `-h` / `help`: usage without starting any transport.
// Checked before doctor/install-plugin so `fimake install-plugin --help`
// also lands here instead of running the install.
if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
    const { getHelpText } = await import("./help");
    console.log(getHelpText(SERVER_VERSION));
    process.exit(0);
}

// Preflight without starting anything: `fimake doctor` answers "is the shared
// server up and reachable?" Exit 0 = ready, 1 = action needed (see doctor.ts).
if (args.includes("doctor")) {
    const { formatDoctorReport, runDoctor } = await import("./doctor");
    const report = await runDoctor(config.PORT);
    console.log(formatDoctorReport(report));
    process.exit(report.ok ? 0 : 1);
}

// `fimake stop`: stop the shared background server without starting anything.
// Only stops the brew-managed service; a stdio instance owned by an MCP
// client keeps its port (see stop.ts) — the hint tells the user how to tell.
if (args.includes("stop")) {
    const { stopSharedServer } = await import("./stop");
    const result = await stopSharedServer();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
}

// `fimake install-plugin`: sideload the Figma dev plugin without manual
// download/unzip/Import-from-manifest (see docs/plans/p3-install-plugin.md).
if (args.includes("install-plugin")) {
    const { runInstallPluginCli } = await import("./install-plugin");
    process.exit(await runInstallPluginCli(args));
}

try {
    if (config.TRANSPORT === "streamable-http") {
        await startStreamableHTTP();
    } else {
        await startSTDIO();
    }
} catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
}
