#!/usr/bin/env node
import { config } from "./config/config";
import { startSTDIO } from "./transport/stdio";
import { startStreamableHTTP } from "./transport/streamable-http";

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
