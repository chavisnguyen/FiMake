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

// Preflight without starting anything: `fimake doctor` answers "can my MCP
// client spawn a server here?" Exit 0 = port free, 1 = conflict (see doctor.ts).
if (args.includes("doctor")) {
    const { formatDoctorReport, runDoctor } = await import("./doctor");
    const report = await runDoctor(config.PORT);
    console.log(formatDoctorReport(report));
    process.exit(report.ok ? 0 : 1);
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
