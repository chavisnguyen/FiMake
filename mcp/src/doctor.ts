import * as fs from "node:fs";
import { SERVER_VERSION } from "./bridge/server";
import { PLUGIN_MANIFEST_ID, getSettingsPath, readSettings } from "./install-plugin";
import type { ManifestFileMetadata } from "./install-plugin";

export interface DoctorCheck {
    name: string;
    ok: boolean;
    detail: string;
}

export interface DoctorReport {
    version: string;
    port: number;
    checks: DoctorCheck[];
    /** True when the shared streamable-http server is up. */
    ok: boolean;
}

type FetchImpl = (
    url: string,
    init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface HealthBody {
    ok?: unknown;
    transport?: unknown;
    pluginConnected?: unknown;
    clients?: unknown;
}

function isHealthBody(value: unknown): value is HealthBody {
    return typeof value === "object" && value !== null;
}

function clientNames(clients: unknown): string {
    if (!Array.isArray(clients) || clients.length === 0) return "no plugin windows";
    const MAX_SHOWN = 5;
    const MAX_NAME = 80;
    const names = clients.slice(0, MAX_SHOWN).map((c) => {
        if (typeof c !== "object" || c === null) return "(unnamed)";
        const name = (c as { fileName?: unknown }).fileName;
        if (typeof name !== "string" || name.length === 0) return "(unnamed)";
        return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME)}…` : name;
    });
    const extra = clients.length > MAX_SHOWN ? ` (…and ${clients.length - MAX_SHOWN} more)` : "";
    return `${clients.length} window${clients.length === 1 ? "" : "s"}: ${names.join(", ")}${extra}`;
}

/**
 * "Is my setup ready?" without starting anything. Default setup is one
 * shared streamable-http server (`brew services start fimake`) that every
 * client reaches at /mcp. Exit 0 = that server is up, 1 = action needed.
 *
 * - fimake (streamable-http) answers /health → ok.
 * - Port free (connection refused) → not running yet: start the service.
 * - fimake (stdio) answers → a client spawned its own server and blocks
 *   the shared one: switch that client to the URL.
 * - Anything else holds the port → conflict with details.
 */
export async function runDoctor(port: number, fetchImpl: FetchImpl = fetch): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [
        { name: "version", ok: true, detail: `fimake ${SERVER_VERSION}` },
    ];
    const mcpUrl = `http://localhost:${port}/mcp`;
    const done = (portCheck: DoctorCheck): DoctorReport => {
        checks.push(portCheck, checkPlugin());
        return { version: SERVER_VERSION, port, checks, ok: portCheck.ok };
    };
    let body: unknown = null;
    try {
        const res = await fetchImpl(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = await res.json();
    } catch (error) {
        if (isRefused(error)) {
            return done({
                name: "server",
                ok: false,
                detail: `nothing on port ${port} — start the server: \`brew services start fimake\` (stdio setup? then this is expected, your client starts it).`,
            });
        }
        if (isTimeout(error)) {
            return done({
                name: "server",
                ok: false,
                detail: `probe of port ${port} timed out after 3s — the server may be hung (restart it: \`brew services restart fimake\`). If it persists: lsof -i :${port}`,
            });
        }
        return done({
            name: "server",
            ok: false,
            detail: `could not probe port ${port} (${describeFetchError(error)}). Something holds the port but doesn't answer — a hung server or a non-fimake app. Try: lsof -i :${port}`,
        });
    }

    if (isHealthBody(body) && body.ok === true) {
        if (body.transport === "stdio") {
            return done({
                name: "server",
                ok: false,
                detail:
                    `port ${port} is held by a fimake server an MCP client spawned via stdio (${clientNames(body.clients)}). ` +
                    `Change that client's config to ${mcpUrl} and restart it, then \`brew services restart fimake\`.`,
            });
        }
        return done({
            name: "server",
            ok: true,
            detail: `fimake running on ${mcpUrl} (${clientNames(body.clients)}).`,
        });
    }
    return done({
        name: "server",
        ok: false,
        detail: `port ${port} answers but is not a fimake server (unexpected /health body). Stop that process: lsof -i :${port}`,
    });
}

/**
 * Best-effort, macOS-only: is the FiMake dev plugin registered with Figma
 * Desktop, and do its 3 manifestPath files still exist on disk? Never
 * throws and never affects `report.ok` — only the server check gates it
 * (see runDoctor above).
 */
function checkPlugin(): DoctorCheck {
    try {
        if (process.platform !== "darwin") {
            return { name: "plugin", ok: true, detail: "skip: plugin check is macOS-only" };
        }
        const settingsPath = getSettingsPath(process.platform, process.env);
        if (!fs.existsSync(settingsPath)) {
            return { name: "plugin", ok: true, detail: "skip: Figma settings.json not found (open Figma Desktop once)" };
        }
        const settings = readSettings(settingsPath);
        const list = settings.localFileExtensions ?? [];
        const record = list.find(
            (r): r is typeof r & { fileMetadata: ManifestFileMetadata } =>
                r.fileMetadata.type === "manifest" && r.lastKnownPluginId === PLUGIN_MANIFEST_ID,
        );
        if (!record) {
            return { name: "plugin", ok: false, detail: "not registered — run `fimake install-plugin`" };
        }
        const uiId = record.fileMetadata.uiFileIds[0];
        const codeRecord = list.find((r) => r.id === record.fileMetadata.codeFileId);
        const uiRecord = uiId === undefined ? undefined : list.find((r) => r.id === uiId);
        const paths = [record.manifestPath, codeRecord?.manifestPath, uiRecord?.manifestPath];
        const missing = paths.some((p) => p === undefined || !fs.existsSync(p));
        if (missing) {
            return { name: "plugin", ok: false, detail: "registered but plugin files missing on disk — run `fimake install-plugin`" };
        }
        return { name: "plugin", ok: true, detail: `registered at ${record.manifestPath}` };
    } catch (error) {
        return { name: "plugin", ok: true, detail: `skip: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/** Connection-refused means nothing listens there — the good case. */
function isRefused(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const rec = error as Record<string, unknown>;
    const code = typeof rec.code === "string" ? rec.code : "";
    const cause = rec.cause as Record<string, unknown> | undefined;
    const causeCode = cause !== null && typeof cause === "object" && typeof cause.code === "string" ? cause.code : "";
    if (code === "ECONNREFUSED" || causeCode === "ECONNREFUSED") return true;
    // Undici wraps a refused connection as "fetch failed" with an
    // ECONNREFUSED cause — but it wraps EVERY network error that way
    // (DNS, reset, …), so only trust it together with the cause code.
    if (causeCode !== "") return false;
    const message = error instanceof Error ? error.message : "";
    return message.includes("ECONNREFUSED");
}

/** AbortSignal.timeout() fired: the port answered TCP but never HTTP. */
function isTimeout(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const rec = error as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (name === "TimeoutError") return true;
    const cause = rec.cause as Record<string, unknown> | undefined;
    const causeName = cause !== null && typeof cause === "object" && typeof cause.name === "string" ? cause.name : "";
    if (causeName === "TimeoutError") return true;
    const message = error instanceof Error ? error.message : "";
    return message.toLowerCase().includes("aborted due to timeout");
}

function describeFetchError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function formatDoctorReport(report: DoctorReport): string {
    const lines = report.checks.map((c) => `${c.ok ? "[ok]" : "[!!]"} ${c.name}: ${c.detail}`);
    lines.push(report.ok ? "doctor: ready" : "doctor: action needed (see above)");
    return lines.join("\n");
}
