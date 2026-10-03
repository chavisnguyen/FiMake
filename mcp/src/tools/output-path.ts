import * as os from "node:os";
import * as path from "node:path";

/**
 * Shared guard for every MCP tool that writes to disk (export-asset,
 * export-file). Rejects null bytes, the filesystem root, and — the actual
 * arbitrary-write hole — sensitive locations a prompt-injected client could
 * target (~/.ssh/authorized_keys, ~/.zshrc, /etc/passwd, …) while keeping
 * normal absolute/relative export paths working.
 *
 * Known limitation (documented, not silently ignored): symlinks on the path
 * are followed by mkdir/writeFile (TOCTOU). Fully closing that needs
 * O_NOFOLLOW openat semantics; the denylist below removes the high-value
 * targets in the meantime.
 */
export function resolveOutputPath(p: string, what = "path"): string {
    if (p.includes("\0")) throw new Error(`Invalid ${what}`);
    const resolved = path.resolve(p);
    const root = path.parse(resolved).root;
    if (resolved === root) throw new Error(`Refusing to write to filesystem root`);
    const sensitive = sensitiveReason(resolved);
    if (sensitive !== null) throw new Error(`Refusing to write to sensitive location (${sensitive}): ${resolved}`);
    return resolved;
}

/** Assert a derived file stays inside a directory (blocks ../ via node names). */
export function assertInsideDir(dir: string, file: string): void {
    const rel = path.relative(dir, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Refusing to write outside outputDir: ${file}`);
    }
}

function sensitiveReason(resolved: string): string | null {
    // Home dot-entries: ~/.ssh, ~/.zshrc, ~/.aws, … (but ~/Documents/x is fine).
    let home = "";
    try {
        home = os.homedir();
    } catch {
        home = "";
    }
    if (home !== "") {
        const rel = path.relative(home, resolved);
        if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
            const first = rel.split(path.sep)[0];
            if (first !== undefined && first.startsWith(".")) return "home dot-entry";
        }
    }
    // OS/system roots (macOS + Linux + Windows). Deliberately NOT /var,
    // /private or /tmp: os.tmpdir() lives under /var on macOS and legit
    // exports go there (tests included) — the tmpdir subtree is allowlisted.
    let tmp = "";
    try {
        tmp = os.tmpdir();
    } catch {
        tmp = "";
    }
    if (tmp !== "" && (resolved === tmp || (!path.relative(tmp, resolved).startsWith("..") && !path.isAbsolute(path.relative(tmp, resolved))))) {
        return null;
    }
    const lower = resolved.toLowerCase();
    const systemPrefixes = [
        "/etc/", "/bin/", "/sbin/", "/usr/", "/system/", "/library/",
        "/boot/", "/proc/", "/sys/",
    ];
    for (const prefix of systemPrefixes) {
        if (lower === prefix.slice(0, -1) || lower.startsWith(prefix)) return "system directory";
    }
    const win = lower.replace(/\//g, "\\");
    const winPrefixes = ["\\windows", "\\program files", "\\program files (x86)", "\\programdata"];
    if (/^[a-z]:\\/.test(win)) {
        for (const prefix of winPrefixes) {
            const rest = win.slice(2);
            if (rest === prefix || rest.startsWith(`${prefix}\\`)) return "system directory";
        }
    }
    return null;
}
