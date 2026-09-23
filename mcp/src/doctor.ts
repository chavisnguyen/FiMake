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
    /** True only when a fresh `stdio` spawn will work (port free). */
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
    const names = clients.map((c) => {
        if (typeof c !== "object" || c === null) return "(unnamed)";
        const name = (c as { fileName?: unknown }).fileName;
        return typeof name === "string" && name.length > 0 ? name : "(unnamed)";
    });
    return `${clients.length} window${clients.length === 1 ? "" : "s"}: ${names.join(", ")}`;
}

/**
 * Preflight for setup: answers "can my MCP client spawn a server here?"
 * without starting anything. Exit 0 = port free, exit 1 = conflict.
 *
 * - Port free (connection refused) → ok: let the client spawn via stdio.
 * - A healthy fimake answers /health → conflict: kill it or reuse it over
 *   streamable-http. Never silently succeed — a hidden server is exactly
 *   how users end up with two servers fighting over one port.
 * - Anything else holds the port → conflict with details.
 */
export async function runDoctor(port: number, fetchImpl: FetchImpl = fetch): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [
        { name: "version", ok: true, detail: `fimake ${SERVER_VERSION}` },
    ];
    const url = `http://localhost:${port}/health`;
    let body: unknown = null;
    try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = await res.json();
    } catch (error) {
        if (isRefused(error)) {
            checks.push({
                name: "port",
                ok: true,
                detail: `port ${port} is free — safe to let your MCP client spawn the server (stdio).`,
            });
            checks.push(checkPlugin());
            return { version: SERVER_VERSION, port, checks, ok: true };
        }
        checks.push({
            name: "port",
            ok: false,
            detail: `could not probe port ${port} (${describeFetchError(error)}). Something holds the port but doesn't answer — a hung server or a non-fimake app. Try: lsof -i :${port}`,
        });
        checks.push(checkPlugin());
        return { version: SERVER_VERSION, port, checks, ok: false };
    }

    if (isHealthBody(body) && body.ok === true) {
        checks.push({
            name: "port",
            ok: false,
            detail:
                `port ${port} is already used by a fimake server (${clientNames(body.clients)}). ` +
                `If your client uses stdio, stop that server first (it spawns its own) — ` +
                `or point your client at http://localhost:${port}/mcp (streamable-http) to reuse it.`,
        });
        checks.push(checkPlugin());
        return { version: SERVER_VERSION, port, checks, ok: false };
    }
    checks.push({
        name: "port",
        ok: false,
        detail: `port ${port} answers but is not a fimake server (unexpected /health body). Pick another PORT or stop that process: lsof -i :${port}`,
    });
    checks.push(checkPlugin());
    return { version: SERVER_VERSION, port, checks, ok: false };
}

/**
 * Best-effort, macOS-only: is the FiMake dev plugin registered with Figma
 * Desktop, and do its 3 manifestPath files still exist on disk? Never
 * throws and never affects `report.ok` — port availability is the only
 * thing that gates a fresh stdio spawn (see runDoctor callers above).
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
    // Undici surfaces refused connections as TypeError: fetch failed.
    const message = error instanceof Error ? error.message : "";
    return message.includes("fetch failed") || message.includes("ECONNREFUSED");
}

function describeFetchError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function formatDoctorReport(report: DoctorReport): string {
    const lines = report.checks.map((c) => `${c.ok ? "[ok]" : "[!!]"} ${c.name}: ${c.detail}`);
    lines.push(report.ok ? "doctor: ready" : "doctor: action needed (see above)");
    return lines.join("\n");
}
