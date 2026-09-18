import { z } from "zod";
import dotenv from "dotenv";

// Load .env BEFORE parsing process.env so TRANSPORT/PORT/TIMEOUTS from
// mcp/.env actually take effect (previously index.ts called dotenv.config()
// after importing this module, so the file was silently ignored).
dotenv.config();

export const envStartSchema = z.object({
    //* The transport to use for the server. Can be one of 'stdio' or 'streamable-http'.
    //* If not specified, the default is 'stdio'.
    //* The 'stdio' transport is used for local work.
    //* The 'streamable-http' transport is used for HTTP-based communication.
    TRANSPORT: z.string().default("stdio").optional().transform((val) => {
        if (val?.toLowerCase() === "streamable-http") return "streamable-http";
        return "stdio";
    }),
    //* How long (ms) a tool call waits for the Figma plugin to report the task
    //* as finished/failed before giving up. Was a hardcoded 5000ms, which is
    //* too short for slower operations and gives no room for the plugin to
    //* recover from a brief disconnect/reconnect.
    TASK_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    //* How long (ms) the server waits for the plugin to acknowledge that it
    //* received a given socket message (e.g. start-task) before treating the
    //* send as failed and queuing it for retry on the next connection.
    TASK_ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    //* Port for both the StreamableHTTP endpoint and the Socket.IO bridge
    //* the Figma plugin connects to. Was a hardcoded const, so remote or
    //* multi-instance setups were impossible.
    PORT: z.coerce.number().int().positive().max(65535).default(10101),
    //* CORS origin for Express + Socket.IO. Defaults to "*" for local dev
    //* (previous behavior); set to your origin in networked deployments.
    CORS_ORIGIN: z.string().default("*"),
    //* Upper bound for JSON bodies on /mcp (prevents oversized payload DoS).
    JSON_BODY_LIMIT: z.string().default("1mb"),
});

export type EnvStartConfig = z.infer<typeof envStartSchema>;

export const config = envStartSchema.parse(process.env);

if (config.CORS_ORIGIN === "*") {
    console.warn('[fimake] CORS_ORIGIN="*" allows any origin; set it explicitly for networked use.');
}

/** Backwards-compat const; prefer `config.PORT` for new code. */
export const PORT = config.PORT;

export type Config = EnvStartConfig;
