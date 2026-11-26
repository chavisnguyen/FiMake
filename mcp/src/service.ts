import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config/config";

const execFileAsync = promisify(execFile);

const LAUNCHD_LABEL = "com.chavisnguyen.fimake";

function plistPath(): string {
    return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function systemdUnitPath(): string {
    return join(homedir(), ".config", "systemd", "user", "fimake.service");
}

function fimakeHomeDir(): string {
    return join(homedir(), ".fimake");
}

function resolveSelfExec(): { cmd: string; args: string[] } {
    const argv1 = process.argv[1];
    // Standalone caxa binary vs `node dist/index.js`
    if (process.execPath && !process.execPath.endsWith("/node") && !process.execPath.endsWith("\\node.exe")) {
        return { cmd: realpathSync(process.execPath), args: [] };
    }
    return { cmd: realpathSync(process.execPath), args: argv1 ? [realpathSync(argv1)] : [] };
}

export async function runServiceCli(argv: string[]): Promise<number> {
    const action = argv[1] || "status";
    const port = String(config.PORT);

    try {
        switch (action) {
            case "install":
            case "start":
                await startService(port);
                return 0;
            case "stop":
                await stopService();
                return 0;
            case "restart":
                await stopService().catch(() => {});
                await startService(port);
                return 0;
            case "uninstall":
                await uninstallService();
                return 0;
            case "status":
                await statusService(port);
                return 0;
            default:
                console.error(`Unknown service action "${action}" (expected: start | stop | restart | status | uninstall)`);
                return 2;
        }
    } catch (err) {
        console.error(`fimake service ${action} failed:`, err instanceof Error ? err.message : String(err));
        return 1;
    }
}

async function startService(port: string): Promise<void> {
    const self = resolveSelfExec();
    const home = fimakeHomeDir();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const logFile = join(home, "daemon.log");
    const os = platform();

    if (os === "darwin") {
        const p = plistPath();
        mkdirSync(dirname(p), { recursive: true });
        const progArgs = [self.cmd, ...self.args].map((s) => `    <string>${s}</string>`).join("\n");
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${progArgs}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TRANSPORT</key>
    <string>streamable-http</string>
    <key>PORT</key>
    <string>${port}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${home}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logFile}</string>
  <key>StandardErrorPath</key>
  <string>${logFile}</string>
</dict>
</plist>
`;
        writeFileSync(p, plist, { mode: 0o644 });
        await execFileAsync("launchctl", ["unload", p]).catch(() => {});
        await execFileAsync("launchctl", ["load", "-w", p]);
        console.log(`🟢 fimake service started on :${port} (log: ${logFile})`);
        return;
    }

    if (os === "linux") {
        const u = systemdUnitPath();
        mkdirSync(dirname(u), { recursive: true });
        const execLine = [self.cmd, ...self.args].map((a) => `"${a}"`).join(" ");
        const unit = `[Unit]
Description=FiMake Figma MCP Server
After=network.target

[Service]
Environment=TRANSPORT=streamable-http
Environment=PORT=${port}
ExecStart=${execLine}
WorkingDirectory=${home}
Restart=always
RestartSec=2
StandardOutput=append:${logFile}
StandardError=append:${logFile}

[Install]
WantedBy=default.target
`;
        writeFileSync(u, unit, { mode: 0o644 });
        await execFileAsync("systemctl", ["--user", "daemon-reload"]).catch(() => {});
        await execFileAsync("systemctl", ["--user", "enable", "--now", "fimake.service"]);
        console.log(`🟢 fimake service started on :${port} (log: ${logFile})`);
        return;
    }

    throw new Error(`Native service management is only supported on macOS and Linux (got ${os})`);
}

export async function stopService(): Promise<void> {
    const os = platform();
    if (os === "darwin" && existsSync(plistPath())) {
        await execFileAsync("launchctl", ["unload", plistPath()]).catch(() => {});
        console.log("🛑 fimake service stopped");
        return;
    }
    if (os === "linux" && existsSync(systemdUnitPath())) {
        await execFileAsync("systemctl", ["--user", "stop", "fimake.service"]).catch(() => {});
        console.log("🛑 fimake service stopped");
        return;
    }
    console.log("⚪ No native fimake service installed");
}

async function uninstallService(): Promise<void> {
    await stopService().catch(() => {});
    const os = platform();
    if (os === "darwin" && existsSync(plistPath())) {
        rmSync(plistPath(), { force: true });
    } else if (os === "linux" && existsSync(systemdUnitPath())) {
        await execFileAsync("systemctl", ["--user", "disable", "fimake.service"]).catch(() => {});
        rmSync(systemdUnitPath(), { force: true });
        await execFileAsync("systemctl", ["--user", "daemon-reload"]).catch(() => {});
    }
    console.log("🗑️  fimake service uninstalled");
}

async function statusService(port: string): Promise<void> {
    try {
        const resp = await fetch(`http://127.0.0.1:${port}/mcp`, { signal: AbortSignal.timeout(1200) });
        void resp.body?.cancel();
        console.log(`🟢 fimake daemon is reachable on http://localhost:${port}/mcp`);
    } catch {
        console.log(`⚪ fimake daemon is not reachable on :${port} (run \`fimake service start\` or \`brew services start fimake\`)`);
    }
}
