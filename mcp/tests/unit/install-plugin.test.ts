import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import {
    PLUGIN_MANIFEST_ID,
    buildRecords,
    patchSettings,
    getSettingsPath,
    verifyPluginDir,
    isFigmaRunning,
    quitFigma,
    confirmQuit,
    installPlugin,
    type Exec,
    type FigmaSettings,
} from "../../src/install-plugin";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("PLUGIN_MANIFEST_ID", () => {
    it("matches plugin/manifest.json (never let the two drift apart silently)", () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "plugin/manifest.json"), "utf8")) as { id: string };
        expect(PLUGIN_MANIFEST_ID).toBe(manifest.id);
    });
});

describe("buildRecords", () => {
    it("builds manifest/code/ui with correct id linkage", () => {
        const [manifest, code, ui] = buildRecords(5, { manifest: "/m", main: "/c", ui: "/u" });
        expect(manifest.id).toBe(5);
        expect(code.id).toBe(6);
        expect(ui.id).toBe(7);
        expect(manifest.fileMetadata).toEqual({ type: "manifest", codeFileId: 6, uiFileIds: [7] });
        expect(code.fileMetadata).toEqual({ type: "code", manifestFileId: 5 });
        expect(ui.fileMetadata).toEqual({ type: "ui", manifestFileId: 5 });
        expect(manifest.lastKnownPluginId).toBe(PLUGIN_MANIFEST_ID);
    });
});

describe("patchSettings", () => {
    const paths = { manifest: "/new/manifest.json", main: "/new/dist/main.js", ui: "/new/dist/index.html" };

    it("inserts 1/2/3 when localFileExtensions is missing", () => {
        const { settings, action } = patchSettings({}, paths);
        expect(action).toBe("insert");
        expect(settings.localFileExtensions?.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it("appends after the current max id when unrelated extensions exist", () => {
        const existing: FigmaSettings = {
            localFileExtensions: [
                { id: 7, manifestPath: "/other", fileMetadata: { type: "manifest", codeFileId: 8, uiFileIds: [9] } },
            ],
        };
        const { settings, action } = patchSettings(existing, paths);
        expect(action).toBe("insert");
        expect(settings.localFileExtensions?.map((r) => r.id)).toEqual([7, 8, 9, 10]);
    });

    it("updates in place (no duplicate, keeps id) when a FiMake record already exists", () => {
        const existing: FigmaSettings = {
            localFileExtensions: [
                {
                    id: 1,
                    manifestPath: "/old/manifest.json",
                    lastKnownName: "FiMake",
                    lastKnownPluginId: PLUGIN_MANIFEST_ID,
                    fileMetadata: { type: "manifest", codeFileId: 2, uiFileIds: [3] },
                },
                { id: 2, manifestPath: "/old/dist/main.js", fileMetadata: { type: "code", manifestFileId: 1 } },
                { id: 3, manifestPath: "/old/dist/index.html", fileMetadata: { type: "ui", manifestFileId: 1 } },
            ],
        };
        const { settings, action } = patchSettings(existing, paths);
        expect(action).toBe("update");
        expect(settings.localFileExtensions).toHaveLength(3);
        expect(settings.localFileExtensions?.find((r) => r.id === 1)?.manifestPath).toBe(paths.manifest);
        expect(settings.localFileExtensions?.find((r) => r.id === 2)?.manifestPath).toBe(paths.main);
        expect(settings.localFileExtensions?.find((r) => r.id === 3)?.manifestPath).toBe(paths.ui);
    });
});

describe("getSettingsPath", () => {
    it("darwin: joins HOME with the Figma Application Support path", () => {
        expect(getSettingsPath("darwin", { HOME: "/Users/x" })).toBe(
            "/Users/x/Library/Application Support/Figma/settings.json",
        );
    });

    it("throws on HOME missing (darwin)", () => {
        expect(() => getSettingsPath("darwin", {})).toThrow(/HOME/);
    });

    it("throws on non-macOS platforms (P3 is macOS-only)", () => {
        expect(() => getSettingsPath("win32", { HOME: "/x" })).toThrow(/macOS-only/);
        expect(() => getSettingsPath("linux", { HOME: "/x" })).toThrow(/macOS-only/);
    });
});

describe("verifyPluginDir", () => {
    it("throws when manifest id does not match the expected FiMake id", async () => {
        const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "fimake-verify-"));
        fs.mkdirSync(path.join(tmp, "dist"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ id: "wrong-id" }));
        fs.writeFileSync(path.join(tmp, "dist", "main.js"), "");
        fs.writeFileSync(path.join(tmp, "dist", "index.html"), "");
        expect(() => verifyPluginDir(tmp)).toThrow(/does not match/);
    });

    it("throws when a file is missing", async () => {
        const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "fimake-verify-"));
        fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ id: PLUGIN_MANIFEST_ID }));
        expect(() => verifyPluginDir(tmp)).toThrow(/incomplete/);
    });
});

describe("isFigmaRunning", () => {
    it("true when pgrep resolves, false when it rejects (no match)", async () => {
        await expect(isFigmaRunning(async () => ({ stdout: "123\n", stderr: "" }))).resolves.toBe(true);
        await expect(
            isFigmaRunning(async () => {
                throw new Error("no match");
            }),
        ).resolves.toBe(false);
    });
});

describe("quitFigma", () => {
    it("resolves 'quit' once isFigmaRunning flips false", async () => {
        let pgrepCalls = 0;
        const exec: Exec = async (cmd) => {
            if (cmd === "osascript") return { stdout: "", stderr: "" };
            pgrepCalls += 1;
            if (pgrepCalls < 2) return { stdout: "123", stderr: "" };
            throw new Error("gone");
        };
        await expect(quitFigma(exec, { timeoutMs: 200, pollMs: 5 })).resolves.toBe("quit");
    });

    it("resolves 'timeout' when Figma never quits", async () => {
        const exec: Exec = async (cmd) => {
            if (cmd === "osascript") return { stdout: "", stderr: "" };
            return { stdout: "123", stderr: "" };
        };
        await expect(quitFigma(exec, { timeoutMs: 30, pollMs: 5 })).resolves.toBe("timeout");
    });
});

describe("confirmQuit", () => {
    it("confirmed immediately with --yes, no prompt asked", async () => {
        const ask = vi.fn();
        await expect(confirmQuit({ yes: true, ask })).resolves.toBe("confirmed");
        expect(ask).not.toHaveBeenCalled();
    });

    it("non-interactive when stdin is not a TTY and --yes was not passed", async () => {
        const ask = vi.fn();
        await expect(confirmQuit({ isTTY: false, ask })).resolves.toBe("non-interactive");
        expect(ask).not.toHaveBeenCalled();
    });

    it("confirmed/declined follow the prompt answer on a TTY", async () => {
        await expect(confirmQuit({ isTTY: true, ask: async () => "y" })).resolves.toBe("confirmed");
        await expect(confirmQuit({ isTTY: true, ask: async () => "n" })).resolves.toBe("declined");
        await expect(confirmQuit({ isTTY: true, ask: async () => "" })).resolves.toBe("declined");
    });
});

describe("installPlugin --dir with an existing local build", () => {
    it("registers the existing dir in place, never downloads (contributor's own plugin/ build)", async () => {
        const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "fimake-local-build-"));
        fs.mkdirSync(path.join(tmp, "dist"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ id: PLUGIN_MANIFEST_ID }));
        fs.writeFileSync(path.join(tmp, "dist", "main.js"), "// local build");
        fs.writeFileSync(path.join(tmp, "dist", "index.html"), "<html></html>");

        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const result = await installPlugin({ dir: tmp, noRegister: true });

        expect(result.manifestPath).toBe(path.join(tmp, "manifest.json"));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("installPlugin --no-register", () => {
    it("downloads + unzips without touching Figma or settings.json", async () => {
        const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "fimake-install-"));
        const installDir = path.join(tmp, "plugin");

        const zip = new AdmZip();
        zip.addFile("manifest.json", Buffer.from(JSON.stringify({ id: PLUGIN_MANIFEST_ID })));
        zip.addFile("dist/main.js", Buffer.from("// main"));
        zip.addFile("dist/index.html", Buffer.from("<html></html>"));
        const zipBuffer = zip.toBuffer();

        const fetchMock = vi.fn(async (url: string) => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
            url,
        }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await installPlugin({ dir: installDir, noRegister: true, versionTag: "v9.9.9" });

        expect(result.registered).toBe(false);
        expect(fs.existsSync(result.manifestPath)).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://github.com/chavisnguyen/FiMake/releases/download/v9.9.9/fimake-plugin.zip",
        );
    });
});
