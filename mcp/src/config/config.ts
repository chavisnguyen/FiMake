import { z } from "zod";
import dotenv from "dotenv";
import { DEFAULT_BATCH_OPERATIONS, MAX_BATCH_OPERATIONS } from "../shared/types/params/create/batch-create";

// Load .env BEFORE parsing process.env so TRANSPORT/PORT/TIMEOUTS from
// mcp/.env actually take effect (previously index.ts called dotenv.config()
// after importing this module, so the file was silently ignored).
// quiet: dotenv v17 logs "injected env ..." to STDOUT by default, which
// would corrupt the JSON-RPC stream in `stdio` transport mode.
dotenv.config({ quiet: true });

export const envStartSchema = z.object({
    //* The transport to use for the server. Can be one of 'stdio' or 'streamable-http'.
    //* If not specified, the default is 'stdio'.
    //* The 'stdio' transport is used for local work.
    //* The 'streamable-http' transport is used for HTTP-based communication.
    TRANSPORT: z.preprocess(
        (val) => (typeof val === "string" ? val.toLowerCase() : val),
        z.enum(["stdio", "streamable-http"]).default("stdio")
    ),
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
    JSON_BODY_LIMIT: z.string().regex(/^\s*\d+(\.\d+)?\s*([kmg]?b?)?\s*$/i, "expected like \"1mb\", \"512kb\" or plain bytes").default("1mb"),
    //* Max ops per `batch-create` call. Measured ~10 ms/op in Figma, so the
    //* default 200 (~2 s) sits well under TASK_TIMEOUT_MS; raise it (up to
    //* the plugin-side ceiling) only if TASK_TIMEOUT_MS has room. No rollback
    //* on failure, so a bigger batch leaves more to clean up after an error.
    BATCH_MAX_OPS: z.coerce.number().int().positive().max(MAX_BATCH_OPERATIONS).default(DEFAULT_BATCH_OPERATIONS),
});

export type EnvStartConfig = z.infer<typeof envStartSchema>;

function parseConfig(): EnvStartConfig {
    const parsed = envStartSchema.safeParse(process.env);
    if (parsed.success) return parsed.data;
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(
        `Invalid fimake configuration (check mcp/.env):\n${details}`
    );
}

export const config = parseConfig();

/** Backwards-compat const; prefer `config.PORT` for new code. */
export const PORT = config.PORT;

export type Config = EnvStartConfig;
