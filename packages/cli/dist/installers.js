import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, link, lstat, mkdir, open, readFile, rename, stat, unlink, } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { applyEdits, modify, parse, printParseErrorCode, } from "jsonc-parser";
import { currentProcessLockOwner, processIsRunning, processMatchesLockOwner, } from "./process-lock.js";
const execFileAsync = promisify(execFile);
const DIRECT_CONFIG_LOCK_RETRY_MS = 25;
const DIRECT_CONFIG_LOCK_TIMEOUT_MS = 5_000;
const DIRECT_CONFIG_LOCK_STALE_MS = 30_000;
export const CLIENT_IDS = [
    "claude-code",
    "claude-desktop",
    "codex",
    "cursor",
    "windsurf",
    "vscode",
    "gemini",
];
function serverDefinition(profileName) {
    return process.platform === "win32"
        ? {
            command: "cmd",
            args: ["/c", "npx", "-y", "@atnms/auto-mcp@0.4.0"],
            env: { AUTO_MCP_PROFILE: profileName },
        }
        : {
            command: "npx",
            args: ["-y", "@atnms/auto-mcp@0.4.0"],
            env: { AUTO_MCP_PROFILE: profileName },
        };
}
export function parseClientList(value) {
    if (!value)
        return [];
    if (value.trim().toLowerCase() === "all")
        return [...CLIENT_IDS];
    const requested = value
        .split(",")
        .map((client) => client.trim().toLowerCase())
        .filter(Boolean);
    const invalid = requested.filter((client) => !CLIENT_IDS.includes(client));
    if (invalid.length > 0) {
        throw new Error(`Unsupported client(s): ${invalid.join(", ")}. Choose from ${CLIENT_IDS.join(", ")}.`);
    }
    return [...new Set(requested)];
}
function directConfigPath(client) {
    const home = os.homedir();
    if (client === "claude-desktop") {
        if (process.platform === "darwin") {
            return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
        }
        if (process.platform === "win32") {
            return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
        }
        return path.join(home, ".config", "Claude", "claude_desktop_config.json");
    }
    if (client === "cursor")
        return path.join(home, ".cursor", "mcp.json");
    if (client === "windsurf") {
        return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    }
    if (client === "vscode") {
        if (process.platform === "darwin") {
            return path.join(home, "Library", "Application Support", "Code", "User", "mcp.json");
        }
        if (process.platform === "win32") {
            return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Code", "User", "mcp.json");
        }
        return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Code", "User", "mcp.json");
    }
    if (client === "gemini")
        return path.join(home, ".gemini", "settings.json");
    return null;
}
function directServerKey(client) {
    return client === "vscode" ? "servers" : "mcpServers";
}
async function preserveWindowsAcl(source, target) {
    if (process.platform !== "win32")
        return;
    try {
        await execFileAsync("powershell.exe", [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$acl = Get-Acl -LiteralPath $env:AUTO_MCP_ACL_SOURCE; Set-Acl -LiteralPath $env:AUTO_MCP_ACL_TARGET -AclObject $acl",
        ], {
            env: {
                ...process.env,
                AUTO_MCP_ACL_SOURCE: source,
                AUTO_MCP_ACL_TARGET: target,
            },
            windowsHide: true,
        });
    }
    catch (error) {
        throw new Error(`Windows client config ACL preservation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function copyConfigBackup(source, target) {
    await copyFile(source, target);
    try {
        await preserveWindowsAcl(source, target);
    }
    catch (error) {
        await unlinkIfExists(target);
        throw error;
    }
}
function parseJsonConfig(contents, configPath, allowJsonc) {
    let parsed;
    try {
        if (allowJsonc) {
            const errors = [];
            parsed = parse(contents, errors, {
                allowTrailingComma: true,
                disallowComments: false,
            });
            if (errors.length > 0) {
                throw new Error(printParseErrorCode(errors[0].error));
            }
        }
        else {
            parsed = JSON.parse(contents);
        }
    }
    catch (error) {
        throw new Error(`Cannot update ${configPath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Cannot update ${configPath}: top-level JSON must be an object`);
    }
    return parsed;
}
async function readDirectConfig(client, configPath) {
    try {
        const fileStat = await lstat(configPath);
        if (fileStat.isSymbolicLink()) {
            throw new Error(`Refusing to replace symbolic-link config: ${configPath}`);
        }
        if (!fileStat.isFile()) {
            throw new Error(`MCP config path is not a regular file: ${configPath}`);
        }
        const contents = await readFile(configPath, "utf8");
        return {
            config: parseJsonConfig(contents, configPath, client === "vscode"),
            contents,
            exists: true,
            mode: fileStat.mode & 0o777,
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { config: {}, contents: null, exists: false, mode: 0o600 };
        }
        throw error;
    }
}
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function unlinkIfExists(target) {
    try {
        await unlink(target);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
}
async function directConfigLockIsAbandoned(target) {
    let owner;
    try {
        owner = JSON.parse(await readFile(target, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        if (!(error instanceof SyntaxError))
            throw error;
    }
    let modifiedAt;
    try {
        modifiedAt = (await stat(target)).mtimeMs;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        throw error;
    }
    const ownerPid = owner?.pid;
    const hasValidPid = typeof ownerPid === "number" &&
        Number.isInteger(ownerPid) &&
        ownerPid > 0;
    if (hasValidPid && !processIsRunning(ownerPid))
        return true;
    if (Date.now() - modifiedAt < DIRECT_CONFIG_LOCK_STALE_MS)
        return false;
    return !(await processMatchesLockOwner(owner ?? {}));
}
async function recoverAbandonedDirectConfigLock(lockPath) {
    const claimPath = `${lockPath}.${process.pid}.${crypto.randomUUID()}.claim`;
    try {
        await link(lockPath, claimPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return true;
        throw error;
    }
    try {
        if (!(await directConfigLockIsAbandoned(claimPath)))
            return false;
        let current;
        let claim;
        try {
            [current, claim] = await Promise.all([stat(lockPath), stat(claimPath)]);
        }
        catch (error) {
            if (error.code === "ENOENT")
                return true;
            throw error;
        }
        if (current.dev !== claim.dev || current.ino !== claim.ino)
            return false;
        await unlinkIfExists(lockPath);
        return true;
    }
    finally {
        await unlinkIfExists(claimPath);
    }
}
async function acquireDirectConfigLock(configPath) {
    const lockPath = `${configPath}.auto.lock`;
    const deadline = Date.now() + DIRECT_CONFIG_LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            const handle = await open(lockPath, "wx", 0o600);
            try {
                await handle.writeFile(JSON.stringify(currentProcessLockOwner()), "utf8");
                await handle.sync();
            }
            catch (error) {
                await handle.close();
                await unlinkIfExists(lockPath);
                throw error;
            }
            await handle.close();
            return async () => unlinkIfExists(lockPath);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            if (await recoverAbandonedDirectConfigLock(lockPath))
                continue;
            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting to update ${configPath}`);
            }
            await wait(DIRECT_CONFIG_LOCK_RETRY_MS);
        }
    }
}
async function writeDirectConfig(client, profileName, replace) {
    const configPath = directConfigPath(client);
    if (!configPath)
        throw new Error(`${client} does not use a direct JSON installer`);
    await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
    const release = await acquireDirectConfigLock(configPath);
    try {
        return await writeDirectConfigLocked(client, profileName, replace, configPath);
    }
    finally {
        await release();
    }
}
async function writeDirectConfigLocked(client, profileName, replace, configPath) {
    const { config, contents, exists, mode } = await readDirectConfig(client, configPath);
    const serverKey = directServerKey(client);
    const currentServers = config[serverKey];
    if (currentServers !== undefined &&
        (!currentServers ||
            typeof currentServers !== "object" ||
            Array.isArray(currentServers))) {
        throw new Error(`Cannot update ${configPath}: ${serverKey} must be an object`);
    }
    const servers = (currentServers ?? {});
    if (servers.auto !== undefined && !replace) {
        throw new Error(`${client} already has an MCP server named 'auto'. Re-run with --replace after reviewing it.`);
    }
    const next = {
        ...config,
        [serverKey]: {
            ...servers,
            auto: serverDefinition(profileName),
        },
    };
    const serialized = client === "vscode" && contents !== null
        ? applyEdits(contents, modify(contents, [serverKey, "auto"], serverDefinition(profileName), {
            formattingOptions: {
                insertSpaces: false,
                tabSize: 4,
                eol: contents.includes("\r\n") ? "\r\n" : "\n",
            },
        }))
        : `${JSON.stringify(next, null, 2)}\n`;
    let backupPath = null;
    if (exists) {
        backupPath = `${configPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
        await copyConfigBackup(configPath, backupPath);
    }
    const temporary = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", mode);
    let writeError;
    try {
        if (exists)
            await preserveWindowsAcl(configPath, temporary);
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
    }
    catch (error) {
        writeError = error;
    }
    finally {
        await handle.close();
    }
    if (writeError) {
        await unlink(temporary).catch(() => undefined);
        throw writeError;
    }
    try {
        await rename(temporary, configPath);
        await chmod(configPath, mode);
    }
    catch (error) {
        await unlinkIfExists(temporary);
        try {
            if (backupPath)
                await copyFile(backupPath, configPath);
            else
                await unlinkIfExists(configPath);
        }
        catch (rollbackError) {
            throw new AggregateError([error, rollbackError], `Failed to finalize and restore ${configPath}`);
        }
        throw error;
    }
    return configPath;
}
function clientCommand(client, profileName, claudeScope = "user") {
    const definition = serverDefinition(profileName);
    if (client === "claude-code") {
        return {
            file: "claude",
            args: [
                "mcp",
                "add-json",
                "--scope",
                claudeScope,
                "auto",
                JSON.stringify({ type: "stdio", ...definition }),
            ],
        };
    }
    if (client === "codex") {
        return {
            file: "codex",
            args: [
                "mcp",
                "add",
                "auto",
                "--env",
                `AUTO_MCP_PROFILE=${profileName}`,
                "--",
                definition.command,
                ...definition.args,
            ],
        };
    }
    return null;
}
async function runClientCommand(client, command) {
    return await new Promise((resolve, reject) => {
        const isWindows = process.platform === "win32";
        const child = spawn(isWindows ? process.env.ComSpec?.trim() || "cmd.exe" : command.file, isWindows
            ? ["/d", "/s", "/c", command.file, ...command.args]
            : command.args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.once("error", (error) => {
            if (error.code === "ENOENT") {
                reject(new Error(`${client} is not installed or is not on PATH. Use --print-only and add the displayed config manually.`));
                return;
            }
            reject(error);
        });
        child.once("exit", (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
}
function inspectionCommand(client) {
    if (client === "claude-code") {
        return { file: "claude", args: ["mcp", "get", "auto"] };
    }
    if (client === "codex") {
        return { file: "codex", args: ["mcp", "get", "auto", "--json"] };
    }
    return null;
}
function removalCommand(client, claudeScope) {
    if (client === "claude-code") {
        return {
            file: "claude",
            args: ["mcp", "remove", "auto", "--scope", claudeScope ?? "user"],
        };
    }
    if (client === "codex") {
        return { file: "codex", args: ["mcp", "remove", "auto"] };
    }
    return null;
}
function claudeScope(inspectionOutput) {
    if (/\bScope:\s*Project config\b/i.test(inspectionOutput)) {
        return "project";
    }
    if (/\bScope:\s*User config\b/i.test(inspectionOutput)) {
        return "user";
    }
    if (/\bScope:\s*Local config\b/i.test(inspectionOutput)) {
        return "local";
    }
    throw new Error("claude-code replacement could not determine the existing Auto server scope");
}
async function claudeConfigPath(scope) {
    if (scope !== "project") {
        const configDirectory = process.env.CLAUDE_CONFIG_DIR?.trim();
        return path.join(configDirectory || os.homedir(), ".claude.json");
    }
    let directory = process.cwd();
    for (;;) {
        const candidate = path.join(directory, ".mcp.json");
        try {
            await lstat(candidate);
            return candidate;
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        const parent = path.dirname(directory);
        if (parent === directory)
            return path.resolve(".mcp.json");
        directory = parent;
    }
}
async function inspectCommandClient(client) {
    const command = inspectionCommand(client);
    if (!command)
        return null;
    const result = await runClientCommand(client, command);
    if (result.code === 0) {
        return { stdout: result.stdout, stderr: result.stderr };
    }
    const detail = `${result.stdout}\n${result.stderr}`.trim();
    if (/\bnot found\b|\bdoes not exist\b|\bno mcp server\b/i.test(detail)) {
        return null;
    }
    throw new Error(`${client} MCP inspection failed (${result.code}): ${detail || "no diagnostic output"}`);
}
async function backupClaudeConfig(inspection) {
    const scope = claudeScope(`${inspection.stdout}\n${inspection.stderr}`);
    const configPath = await claudeConfigPath(scope);
    const fileStat = await lstat(configPath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new Error(`Refusing to replace non-regular Claude config: ${configPath}`);
    }
    const backupPath = `${configPath}.auto-mcp-backup.${process.pid}.${crypto.randomUUID()}`;
    await copyConfigBackup(configPath, backupPath);
    return { configPath, backupPath, scope };
}
async function installCommandClient(client, profileName, replace) {
    const lockTarget = path.join(os.homedir(), ".auto", "mcp", `${client}-client`);
    await mkdir(path.dirname(lockTarget), { recursive: true, mode: 0o700 });
    const release = await acquireDirectConfigLock(lockTarget);
    try {
        await installCommandClientLocked(client, profileName, replace);
    }
    finally {
        await release();
    }
}
async function installCommandClientLocked(client, profileName, replace) {
    const inspection = await inspectCommandClient(client);
    const exists = inspection !== null;
    if (exists && !replace) {
        throw new Error(`${client} already has an MCP server named 'auto'. Re-run with --replace after reviewing it.`);
    }
    let claudeBackup = null;
    if (exists && client === "claude-code") {
        claudeBackup = await backupClaudeConfig(inspection);
        const removal = removalCommand(client, claudeBackup.scope);
        if (!removal)
            throw new Error(`${client} does not support safe replacement`);
        const removed = await runClientCommand(client, removal);
        if (removed.code !== 0) {
            try {
                await rename(claudeBackup.backupPath, claudeBackup.configPath);
            }
            catch (rollbackError) {
                throw new Error(`${client} removal failed (${removed.code}): ${removed.stderr.trim()}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
            throw new Error(`${client} removal failed (${removed.code}): ${removed.stderr.trim()}`);
        }
    }
    const command = clientCommand(client, profileName, claudeBackup?.scope);
    if (!command)
        throw new Error(`${client} does not use a command installer`);
    let installed;
    try {
        installed = await runClientCommand(client, command);
    }
    catch (error) {
        if (claudeBackup) {
            try {
                await rename(claudeBackup.backupPath, claudeBackup.configPath);
            }
            catch (rollbackError) {
                throw new AggregateError([error, rollbackError], `${client} installer could not start and rollback failed`);
            }
        }
        throw error;
    }
    if (installed.code !== 0) {
        if (claudeBackup) {
            try {
                await rename(claudeBackup.backupPath, claudeBackup.configPath);
            }
            catch (rollbackError) {
                throw new Error(`${client} installer failed (${installed.code}): ${installed.stderr.trim()}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
        }
        throw new Error(`${client} installer failed (${installed.code}): ${installed.stderr.trim()}`);
    }
    if (claudeBackup) {
        await unlink(claudeBackup.backupPath);
    }
}
function shellQuote(value) {
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value))
        return value;
    if (process.platform === "win32") {
        return `'${value.replaceAll("'", "''")}'`;
    }
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
function printableConfig(client, profileName) {
    const command = clientCommand(client, profileName);
    if (command) {
        return [command.file, ...command.args].map(shellQuote).join(" ");
    }
    return JSON.stringify({ [directServerKey(client)]: { auto: serverDefinition(profileName) } }, null, 2);
}
export async function configureClients({ profileName, clients, printOnly, replace, }) {
    for (const client of clients) {
        if (printOnly) {
            process.stdout.write(`\n${client}:\n${printableConfig(client, profileName)}\n`);
            continue;
        }
        const command = clientCommand(client, profileName);
        if (command) {
            await installCommandClient(client, profileName, replace);
            process.stdout.write(`Configured ${client}.\n`);
            continue;
        }
        const configPath = await writeDirectConfig(client, profileName, replace);
        process.stdout.write(`Configured ${client}: ${configPath}\n`);
    }
}
//# sourceMappingURL=installers.js.map