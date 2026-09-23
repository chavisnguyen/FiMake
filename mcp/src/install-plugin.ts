import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import { SERVER_VERSION } from "./bridge/server";

// Mirrors plugin/manifest.json:3 — asserted equal in install-plugin.test.ts
// so the two never drift apart silently.
export const PLUGIN_MANIFEST_ID = "1572223324912824909";

const FIGMA_PROCESS_NAME = "Figma";
const QUIT_TIMEOUT_MS = 10000;
const QUIT_POLL_MS = 500;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * `settings.json` location Figma Desktop writes `localFileExtensions` to.
 * macOS-only for P3 (Figma Desktop has no native Linux app, and there is no
 * Windows binary in release.yml yet) — other platforms throw so a caller
 * falls back to `--no-register` instead of guessing a wrong path.
 */
export function getSettingsPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
    if (platform === "darwin") {
        const home = env.HOME;
        if (!home) throw new Error("HOME is not set — cannot locate Figma's settings.json.");
        return path.join(home, "Library", "Application Support", "Figma", "settings.json");
    }
    throw new Error(
        `install-plugin registration is macOS-only for now (platform: ${platform}). ` +
            "Use --no-register and import the plugin manually instead.",
    );
}

/** Stable extraction dir the user won't accidentally delete (unlike ~/Downloads). */
export function defaultInstallDir(version: string, env: NodeJS.ProcessEnv): string {
    const home = env.HOME ?? os.homedir();
    return path.join(home, ".fimake", "plugin", version);
}

// ---------------------------------------------------------------------------
// settings.json record shape (pure)
// ---------------------------------------------------------------------------

export interface ManifestFileMetadata {
    type: "manifest";
    codeFileId: number;
    uiFileIds: number[];
}
export interface CodeFileMetadata {
    type: "code";
    manifestFileId: number;
}
export interface UiFileMetadata {
    type: "ui";
    manifestFileId: number;
}

export interface LocalFileExtensionRecord {
    id: number;
    manifestPath: string;
    lastKnownName?: string;
    lastKnownPluginId?: string;
    fileMetadata: ManifestFileMetadata | CodeFileMetadata | UiFileMetadata;
    // Figma writes other fields too (e.g. cachedContainsWidget) — preserved
    // as-is by patchSettings for existing records, omitted for new ones
    // (Figma fills its own defaults for a record it didn't write itself).
}

export interface FigmaSettings {
    localFileExtensions?: LocalFileExtensionRecord[];
    [key: string]: unknown;
}

export interface PluginPaths {
    manifest: string;
    main: string;
    ui: string;
}

/** Build the 3-record shape Figma writes for "Import plugin from manifest" (pure). */
export function buildRecords(
    nextId: number,
    paths: PluginPaths,
): [LocalFileExtensionRecord, LocalFileExtensionRecord, LocalFileExtensionRecord] {
    const manifestId = nextId;
    const codeId = nextId + 1;
    const uiId = nextId + 2;
    return [
        {
            id: manifestId,
            manifestPath: paths.manifest,
            lastKnownName: "Fimake",
            lastKnownPluginId: PLUGIN_MANIFEST_ID,
            fileMetadata: { type: "manifest", codeFileId: codeId, uiFileIds: [uiId] },
        },
        {
            id: codeId,
            manifestPath: paths.main,
            fileMetadata: { type: "code", manifestFileId: manifestId },
        },
        {
            id: uiId,
            manifestPath: paths.ui,
            fileMetadata: { type: "ui", manifestFileId: manifestId },
        },
    ];
}

export interface PatchResult {
    settings: FigmaSettings;
    action: "insert" | "update";
}

/**
 * Insert the FiMake records, or update their `manifestPath`s in place if a
 * record for PLUGIN_MANIFEST_ID already exists — never duplicates entries
 * across repeated installs/version bumps.
 */
export function patchSettings(settings: FigmaSettings, paths: PluginPaths): PatchResult {
    const list = settings.localFileExtensions ?? [];
    const existing = list.find(
        (r): r is LocalFileExtensionRecord & { fileMetadata: ManifestFileMetadata } =>
            r.fileMetadata.type === "manifest" && r.lastKnownPluginId === PLUGIN_MANIFEST_ID,
    );

    if (existing) {
        const codeId = existing.fileMetadata.codeFileId;
        const uiId = existing.fileMetadata.uiFileIds[0];
        if (uiId === undefined) {
            throw new Error(
                "Existing FiMake entry in settings.json has no UI file id — " +
                    "remove that entry manually and re-run install-plugin.",
            );
        }
        const next = list.map((r) => {
            if (r.id === existing.id) return { ...r, manifestPath: paths.manifest, lastKnownName: "Fimake" };
            if (r.id === codeId) return { ...r, manifestPath: paths.main };
            if (r.id === uiId) return { ...r, manifestPath: paths.ui };
            return r;
        });
        return { settings: { ...settings, localFileExtensions: next }, action: "update" };
    }

    const maxId = list.reduce((max, r) => Math.max(max, r.id), 0);
    const records = buildRecords(maxId + 1, paths);
    return { settings: { ...settings, localFileExtensions: [...list, ...records] }, action: "insert" };
}

// ---------------------------------------------------------------------------
// settings.json read/write
// ---------------------------------------------------------------------------

export function readSettings(settingsPath: string): FigmaSettings {
    if (!fs.existsSync(settingsPath)) {
        throw new Error(
            `Figma settings.json not found at ${settingsPath}. Open Figma Desktop at least once, ` +
                "then re-run this command — or use --no-register to just download and unzip the plugin.",
        );
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
        throw new Error(`${settingsPath} is not a JSON object — refusing to patch it. Use --no-register instead.`);
    }
    return parsed as FigmaSettings;
}

/** Backup before every write — never overwrite settings.json without one. */
export function backupSettings(settingsPath: string): string {
    const backupPath = `${settingsPath}.bak-${Date.now()}`;
    fs.copyFileSync(settingsPath, backupPath);
    return backupPath;
}

export function writeSettings(settingsPath: string, settings: FigmaSettings): void {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Quit-Figma guard (macOS only, best-effort)
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

/** Injectable so tests never shell out to real `pgrep`/`osascript`. */
export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: Exec = (cmd, args) => execFileAsync(cmd, args);

/** `pgrep` exits non-zero when nothing matches — that failure means "not running". */
export async function isFigmaRunning(exec: Exec = defaultExec): Promise<boolean> {
    try {
        await exec("pgrep", ["-x", FIGMA_PROCESS_NAME]);
        return true;
    } catch {
        return false;
    }
}

export type QuitOutcome = "quit" | "timeout";

/**
 * Graceful quit (never force-kill): if Figma has its own "unsaved changes"
 * dialog it will show it, so we poll for the process to actually disappear
 * instead of assuming the osascript call alone means Figma is gone.
 */
export async function quitFigma(
    exec: Exec = defaultExec,
    opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<QuitOutcome> {
    const timeoutMs = opts.timeoutMs ?? QUIT_TIMEOUT_MS;
    const pollMs = opts.pollMs ?? QUIT_POLL_MS;
    await exec("osascript", ["-e", `quit app "${FIGMA_PROCESS_NAME}"`]);
    const deadline = Date.now() + timeoutMs;
    do {
        if (!(await isFigmaRunning(exec))) return "quit";
        await sleep(pollMs);
    } while (Date.now() < deadline);
    return "timeout";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ConfirmQuitOutcome = "confirmed" | "declined" | "non-interactive";

/** Skips the prompt (never guesses) when non-interactive and `--yes` wasn't passed. */
export async function confirmQuit(
    opts: {
        yes?: boolean | undefined;
        isTTY?: boolean | undefined;
        ask?: ((question: string) => Promise<string>) | undefined;
    } = {},
): Promise<ConfirmQuitOutcome> {
    if (opts.yes) return "confirmed";
    const isTTY = opts.isTTY ?? process.stdin.isTTY === true;
    if (!isTTY) return "non-interactive";
    const ask = opts.ask ?? defaultAsk;
    const answer = await ask("Figma is running and will overwrite settings.json on quit. Quit it now to continue? [y/N] ");
    return answer.trim().toLowerCase() === "y" ? "confirmed" : "declined";
}

async function defaultAsk(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await rl.question(question);
    } finally {
        rl.close();
    }
}

// ---------------------------------------------------------------------------
// Download + unzip + verify
// ---------------------------------------------------------------------------

export async function downloadPluginZip(url: string, destZip: string, fetchImpl: typeof fetch = fetch): Promise<void> {
    const res = await fetchImpl(url);
    if (!res.ok) {
        throw new Error(
            `Failed to download the plugin zip (HTTP ${res.status}) from ${url}. ` +
                "Check your network, or pass --version-tag to pick a different release.",
        );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) {
        throw new Error(`Downloaded plugin zip from ${url} is empty — the release asset may be missing.`);
    }
    await fsp.mkdir(path.dirname(destZip), { recursive: true });
    await fsp.writeFile(destZip, buf);
}

export function unzipPlugin(zipPath: string, destDir: string): void {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
}

/** Like verifyPluginDir, but returns undefined instead of throwing (used to detect a reusable dir). */
export function tryVerifyPluginDir(dir: string): PluginPaths | undefined {
    try {
        return verifyPluginDir(dir);
    } catch {
        return undefined;
    }
}

async function downloadAndExtract(versionTag: string, version: string, installDir: string): Promise<PluginPaths> {
    const zipUrl = `https://github.com/chavisnguyen/FiMake/releases/download/${versionTag}/fimake-plugin.zip`;
    const destZip = path.join(os.tmpdir(), `fimake-plugin-${version}.zip`);
    await downloadPluginZip(zipUrl, destZip);
    unzipPlugin(destZip, installDir);
    return verifyPluginDir(installDir);
}

/** Fail fast if the zip didn't contain what we expect, before touching Figma at all. */
export function verifyPluginDir(dir: string): PluginPaths {
    const paths: PluginPaths = {
        manifest: path.join(dir, "manifest.json"),
        main: path.join(dir, "dist", "main.js"),
        ui: path.join(dir, "dist", "index.html"),
    };
    for (const p of Object.values(paths)) {
        if (!fs.existsSync(p)) {
            throw new Error(`Plugin package at ${dir} is incomplete — missing ${p}. Re-run install-plugin.`);
        }
    }
    const manifest: unknown = JSON.parse(fs.readFileSync(paths.manifest, "utf8"));
    const id = typeof manifest === "object" && manifest !== null ? (manifest as { id?: unknown }).id : undefined;
    if (id !== PLUGIN_MANIFEST_ID) {
        throw new Error(
            `Downloaded plugin manifest id (${String(id)}) does not match the expected FiMake id ` +
                `(${PLUGIN_MANIFEST_ID}). The release zip may be wrong or corrupted — try again or pass --version-tag.`,
        );
    }
    return paths;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface InstallPluginOptions {
    dir?: string | undefined;
    noRegister?: boolean | undefined;
    versionTag?: string | undefined;
    yes?: boolean | undefined;
}

export interface InstallPluginResult {
    manifestPath: string;
    registered: boolean;
}

export async function installPlugin(opts: InstallPluginOptions): Promise<InstallPluginResult> {
    const versionTag = opts.versionTag ?? `v${SERVER_VERSION}`;
    const version = versionTag.replace(/^v/, "");
    const installDir = opts.dir ?? defaultInstallDir(version, process.env);

    // If installDir already holds a valid FiMake build (e.g. a contributor's
    // own `plugin/` after `make build`, or a previous run at this same
    // version), register it in place instead of downloading a release zip
    // on top of it — --dir exists precisely so contributors can point this
    // at their local build without it being overwritten.
    const paths = tryVerifyPluginDir(installDir) ?? (await downloadAndExtract(versionTag, version, installDir));

    if (opts.noRegister) {
        return { manifestPath: paths.manifest, registered: false };
    }

    if (await isFigmaRunning()) {
        const outcome = await confirmQuit({ yes: opts.yes });
        if (outcome === "non-interactive") {
            throw new Error(
                "Figma is running and this shell isn't interactive. Re-run with --yes to quit Figma " +
                    "automatically, or --no-register to import the plugin manually without quitting Figma.",
            );
        }
        if (outcome === "declined") {
            throw new Error(
                "Figma is running. Quit it yourself and re-run this command, or re-run with --no-register " +
                    "to import the plugin manually instead.",
            );
        }
        const quitResult = await quitFigma();
        if (quitResult === "timeout") {
            throw new Error("Figma did not quit — finish any pending dialog in Figma, then re-run this command.");
        }
    }

    const settingsPath = getSettingsPath(process.platform, process.env);
    const settings = readSettings(settingsPath);
    backupSettings(settingsPath);
    const { settings: patched } = patchSettings(settings, paths);
    writeSettings(settingsPath, patched);

    // Verify after write: parse back + confirm the 3 files it points at exist.
    readSettings(settingsPath);
    for (const p of Object.values(paths)) {
        if (!fs.existsSync(p)) {
            throw new Error(`Verification failed after writing settings.json: ${p} is missing.`);
        }
    }

    return { manifestPath: paths.manifest, registered: true };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function getFlagValue(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
}

export async function runInstallPluginCli(args: string[]): Promise<number> {
    const opts: InstallPluginOptions = {
        dir: getFlagValue(args, "--dir"),
        noRegister: args.includes("--no-register"),
        versionTag: getFlagValue(args, "--version-tag"),
        yes: args.includes("--yes") || args.includes("-y"),
    };
    try {
        const result = await installPlugin(opts);
        console.log(`Plugin manifest: ${result.manifestPath}`);
        if (result.registered) {
            console.log("Registered with Figma. Reopen Figma > Plugins > Development > Fimake.");
        } else {
            console.log(
                "Not registered (--no-register). In Figma: Plugins > Development > Import plugin from manifest, " +
                    "then select the manifest above.",
            );
        }
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error("Run `fimake doctor` for more diagnostics.");
        return 1;
    }
}
