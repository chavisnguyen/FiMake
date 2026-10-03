import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config/config";
import type { Exec } from "./install-plugin";

const execFileAsync = promisify(execFile);
const defaultExec: Exec = (cmd, args) => execFileAsync(cmd, args);

export interface StopResult {
    ok: boolean;
    message: string;
}

/**
 * Stop the one shared background server (`brew services stop fimake`).
 *
 * Deliberately thin: this only stops the brew-managed service. A stdio
 * instance spawned by an MCP client (`"command": "fimake"`) is owned by
 * that client and keeps holding the port — killing it from here would
 * break the client's session mid-flight, so a still-held port after a
 * successful stop means "fix the client config", not "kill harder".
 * `fimake doctor` tells the two cases apart (see the post-stop hint).
 */
export async function stopSharedServer(exec: Exec = defaultExec): Promise<StopResult> {
    try {
        const { stdout, stderr } = await exec("brew", ["services", "stop", "fimake"]);
        const output = `${stdout}\n${stderr}`.trim();
        if (/not started|not running|no service|unknown service/i.test(output)) {
            return { ok: true, message: "fimake service is not running — nothing to stop." };
        }
        return {
            ok: true,
            message:
                "Stopped the shared fimake server. " +
                `Run \`fimake doctor\` to confirm port ${config.PORT} is free — ` +
                "if it is still held, an MCP client spawned its own server via stdio (see `fimake --help`).",
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ENOENT|command not found|not found/i.test(message)) {
            return {
                ok: false,
                message:
                    "Could not run `brew` (not installed or not on PATH). " +
                    "Stop the server the way it was started — e.g. quit the terminal running " +
                    `\`TRANSPORT=streamable-http ./fimake-*\`, or kill the process on port ${config.PORT} (lsof -i :${config.PORT}).`,
            };
        }
        return {
            ok: false,
            message: `Could not stop the fimake service: ${message}. Run \`fimake doctor\` for diagnostics.`,
        };
    }
}
