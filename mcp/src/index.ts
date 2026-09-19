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
