import { execFile, spawn } from "node:child_process";
import {
	chmod,
	copyFile,
	link,
	lstat,
	mkdir,
	open,
	readFile,
	rename,
	stat,
	unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import {
	applyEdits,
	modify,
	parse,
	type ParseError,
	printParseErrorCode,
} from "jsonc-parser";

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
] as const;

export type ClientId = (typeof CLIENT_IDS)[number];

interface ConfigureClientsOptions {
	profileName: string;
	clients: ClientId[];
	printOnly: boolean;
	replace: boolean;
}

interface ServerDefinition {
	command: string;
	args: string[];
	env: { AUTO_MCP_PROFILE: string };
}

function serverDefinition(profileName: string): ServerDefinition {
	return process.platform === "win32"
		? {
				command: "cmd",
				args: ["/c", "npx", "-y", "@atnms/auto-mcp@latest"],
				env: { AUTO_MCP_PROFILE: profileName },
			}
		: {
				command: "npx",
				args: ["-y", "@atnms/auto-mcp@latest"],
				env: { AUTO_MCP_PROFILE: profileName },
			};
}

export function parseClientList(value: string | undefined): ClientId[] {
	if (!value) return [];
	if (value.trim().toLowerCase() === "all") return [...CLIENT_IDS];
	const requested = value
		.split(",")
		.map((client) => client.trim().toLowerCase())
		.filter(Boolean);
	const invalid = requested.filter(
		(client) => !CLIENT_IDS.includes(client as ClientId),
	);
	if (invalid.length > 0) {
		throw new Error(
			`Unsupported client(s): ${invalid.join(", ")}. Choose from ${CLIENT_IDS.join(", ")}.`,
		);
	}
	return [...new Set(requested as ClientId[])];
}

function directConfigPath(client: ClientId): string | null {
	const home = os.homedir();
	if (client === "claude-desktop") {
		if (process.platform === "darwin") {
			return path.join(
				home,
				"Library",
				"Application Support",
				"Claude",
				"claude_desktop_config.json",
			);
		}
		if (process.platform === "win32") {
			return path.join(
				process.env.APPDATA || path.join(home, "AppData", "Roaming"),
				"Claude",
				"claude_desktop_config.json",
			);
		}
		return path.join(home, ".config", "Claude", "claude_desktop_config.json");
	}
	if (client === "cursor") return path.join(home, ".cursor", "mcp.json");
	if (client === "windsurf") {
		return path.join(home, ".codeium", "windsurf", "mcp_config.json");
	}
	if (client === "vscode") {
		if (process.platform === "darwin") {
			return path.join(
				home,
				"Library",
				"Application Support",
				"Code",
				"User",
				"mcp.json",
			);
		}
		if (process.platform === "win32") {
			return path.join(
				process.env.APPDATA || path.join(home, "AppData", "Roaming"),
				"Code",
				"User",
				"mcp.json",
			);
		}
		return path.join(
			process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
			"Code",
			"User",
			"mcp.json",
		);
	}
	if (client === "gemini") return path.join(home, ".gemini", "settings.json");
	return null;
}

function directServerKey(client: ClientId): "mcpServers" | "servers" {
	return client === "vscode" ? "servers" : "mcpServers";
}

async function preserveWindowsAcl(source: string, target: string): Promise<void> {
	if (process.platform !== "win32") return;
	try {
		await execFileAsync(
			"powershell.exe",
			[
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$acl = Get-Acl -LiteralPath $args[0]; Set-Acl -LiteralPath $args[1] -AclObject $acl",
				source,
				target,
			],
			{ windowsHide: true },
		);
	} catch (error) {
		throw new Error(
			`Windows client config ACL preservation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function parseJsonConfig(
	contents: string,
	configPath: string,
	allowJsonc: boolean,
): Record<string, unknown> {
	let parsed: unknown;
	try {
		if (allowJsonc) {
			const errors: ParseError[] = [];
			parsed = parse(contents, errors, {
				allowTrailingComma: true,
				disallowComments: false,
			});
			if (errors.length > 0) {
				throw new Error(printParseErrorCode(errors[0].error));
			}
		} else {
			parsed = JSON.parse(contents);
		}
	} catch (error) {
		throw new Error(
			`Cannot update ${configPath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Cannot update ${configPath}: top-level JSON must be an object`);
	}
	return parsed as Record<string, unknown>;
}

async function readDirectConfig(client: ClientId, configPath: string): Promise<{
	config: Record<string, unknown>;
	contents: string | null;
	exists: boolean;
	mode: number;
}> {
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
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { config: {}, contents: null, exists: false, mode: 0o600 };
		}
		throw error;
	}
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

async function unlinkIfExists(target: string): Promise<void> {
	try {
		await unlink(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

async function directConfigLockIsAbandoned(target: string): Promise<boolean> {
	let owner: { pid?: unknown } | undefined;
	try {
		owner = JSON.parse(await readFile(target, "utf8")) as { pid?: unknown };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		if (!(error instanceof SyntaxError)) throw error;
	}
	let modifiedAt: number;
	try {
		modifiedAt = (await stat(target)).mtimeMs;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
	const ownerPid = owner?.pid;
	if (Date.now() - modifiedAt >= DIRECT_CONFIG_LOCK_STALE_MS) return true;
	if (
		typeof ownerPid === "number" &&
		Number.isInteger(ownerPid) &&
		ownerPid > 0
	) {
		return !processIsRunning(ownerPid);
	}
	return false;
}

async function recoverAbandonedDirectConfigLock(
	lockPath: string,
): Promise<boolean> {
	const claimPath = `${lockPath}.${process.pid}.${crypto.randomUUID()}.claim`;
	try {
		await link(lockPath, claimPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
	try {
		if (!(await directConfigLockIsAbandoned(claimPath))) return false;
		let current;
		let claim;
		try {
			[current, claim] = await Promise.all([stat(lockPath), stat(claimPath)]);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
			throw error;
		}
		if (current.dev !== claim.dev || current.ino !== claim.ino) return false;
		await unlinkIfExists(lockPath);
		return true;
	} finally {
		await unlinkIfExists(claimPath);
	}
}

async function acquireDirectConfigLock(
	configPath: string,
): Promise<() => Promise<void>> {
	const lockPath = `${configPath}.auto.lock`;
	const deadline = Date.now() + DIRECT_CONFIG_LOCK_TIMEOUT_MS;
	for (;;) {
		try {
			const handle = await open(lockPath, "wx", 0o600);
			try {
				await handle.writeFile(JSON.stringify({ pid: process.pid }), "utf8");
				await handle.sync();
			} catch (error) {
				await handle.close();
				await unlinkIfExists(lockPath);
				throw error;
			}
			await handle.close();
			return async () => unlinkIfExists(lockPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			if (await recoverAbandonedDirectConfigLock(lockPath)) continue;
			if (Date.now() >= deadline) {
				throw new Error(`Timed out waiting to update ${configPath}`);
			}
			await wait(DIRECT_CONFIG_LOCK_RETRY_MS);
		}
	}
}

async function writeDirectConfig(
	client: ClientId,
	profileName: string,
	replace: boolean,
): Promise<string> {
	const configPath = directConfigPath(client);
	if (!configPath) throw new Error(`${client} does not use a direct JSON installer`);
	await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
	const release = await acquireDirectConfigLock(configPath);
	try {
		return await writeDirectConfigLocked(client, profileName, replace, configPath);
	} finally {
		await release();
	}
}

async function writeDirectConfigLocked(
	client: ClientId,
	profileName: string,
	replace: boolean,
	configPath: string,
): Promise<string> {
	const { config, contents, exists, mode } = await readDirectConfig(
		client,
		configPath,
	);
	const serverKey = directServerKey(client);
	const currentServers = config[serverKey];
	if (
		currentServers !== undefined &&
		(!currentServers ||
			typeof currentServers !== "object" ||
			Array.isArray(currentServers))
	) {
		throw new Error(`Cannot update ${configPath}: ${serverKey} must be an object`);
	}
	const servers = (currentServers ?? {}) as Record<string, unknown>;
	if (servers.auto !== undefined && !replace) {
		throw new Error(
			`${client} already has an MCP server named 'auto'. Re-run with --replace after reviewing it.`,
		);
	}
	const next = {
		...config,
		[serverKey]: {
			...servers,
			auto: serverDefinition(profileName),
		},
	};
	const serialized =
		client === "vscode" && contents !== null
			? applyEdits(
					contents,
					modify(contents, [serverKey, "auto"], serverDefinition(profileName), {
						formattingOptions: {
							insertSpaces: false,
							tabSize: 4,
							eol: contents.includes("\r\n") ? "\r\n" : "\n",
						},
					}),
				)
			: `${JSON.stringify(next, null, 2)}\n`;
	if (exists) {
		const backupPath = `${configPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
		await copyFile(configPath, backupPath);
	}
	const temporary = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	const handle = await open(temporary, "wx", mode);
	let writeError: unknown;
	try {
		if (exists) await preserveWindowsAcl(configPath, temporary);
		await handle.writeFile(serialized, "utf8");
		await handle.sync();
	} catch (error) {
		writeError = error;
	} finally {
		await handle.close();
	}
	if (writeError) {
		await unlink(temporary).catch(() => undefined);
		throw writeError;
	}
	await rename(temporary, configPath);
	await chmod(configPath, mode);
	return configPath;
}

function clientCommand(
	client: ClientId,
	profileName: string,
	claudeScope: "user" | "project" | "local" = "user",
): { file: string; args: string[] } | null {
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

async function runClientCommand(
	client: ClientId,
	command: { file: string; args: string[] },
): Promise<{ code: number; stdout: string; stderr: string }> {
	return await new Promise((resolve, reject) => {
		const isWindows = process.platform === "win32";
		const child = spawn(
			isWindows ? process.env.ComSpec?.trim() || "cmd.exe" : command.file,
			isWindows
				? ["/d", "/s", "/c", command.file, ...command.args]
				: command.args,
			{ stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.once("error", (error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				reject(
					new Error(
						`${client} is not installed or is not on PATH. Use --print-only and add the displayed config manually.`,
					),
				);
				return;
			}
			reject(error);
		});
		child.once("exit", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});
	});
}

function inspectionCommand(
	client: ClientId,
): { file: string; args: string[] } | null {
	if (client === "claude-code") {
		return { file: "claude", args: ["mcp", "get", "auto"] };
	}
	if (client === "codex") {
		return { file: "codex", args: ["mcp", "get", "auto", "--json"] };
	}
	return null;
}

function removalCommand(
	client: ClientId,
	claudeScope?: "user" | "project" | "local",
): { file: string; args: string[] } | null {
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

function claudeScope(
	inspectionOutput: string,
): "user" | "project" | "local" {
	if (/\bScope:\s*Project config\b/i.test(inspectionOutput)) {
		return "project";
	}
	if (/\bScope:\s*User config\b/i.test(inspectionOutput)) {
		return "user";
	}
	if (/\bScope:\s*Local config\b/i.test(inspectionOutput)) {
		return "local";
	}
	throw new Error(
		"claude-code replacement could not determine the existing Auto server scope",
	);
}

async function claudeConfigPath(
	scope: "user" | "project" | "local",
): Promise<string> {
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
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const parent = path.dirname(directory);
		if (parent === directory) return path.resolve(".mcp.json");
		directory = parent;
	}
}

async function inspectCommandClient(
	client: ClientId,
): Promise<{ stdout: string; stderr: string } | null> {
	const command = inspectionCommand(client);
	if (!command) return null;
	const result = await runClientCommand(client, command);
	if (result.code === 0) {
		return { stdout: result.stdout, stderr: result.stderr };
	}
	const detail = `${result.stdout}\n${result.stderr}`.trim();
	if (/\bnot found\b|\bdoes not exist\b|\bno mcp server\b/i.test(detail)) {
		return null;
	}
	throw new Error(
		`${client} MCP inspection failed (${result.code}): ${detail || "no diagnostic output"}`,
	);
}

async function backupClaudeConfig(
	inspection: { stdout: string; stderr: string },
): Promise<{
	configPath: string;
	backupPath: string;
	scope: "user" | "project" | "local";
}> {
	const scope = claudeScope(`${inspection.stdout}\n${inspection.stderr}`);
	const configPath = await claudeConfigPath(scope);
	const fileStat = await lstat(configPath);
	if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
		throw new Error(
			`Refusing to replace non-regular Claude config: ${configPath}`,
		);
	}
	const backupPath = `${configPath}.auto-mcp-backup.${process.pid}.${crypto.randomUUID()}`;
	await copyFile(configPath, backupPath);
	return { configPath, backupPath, scope };
}

async function installCommandClient(
	client: ClientId,
	profileName: string,
	replace: boolean,
): Promise<void> {
	const inspection = await inspectCommandClient(client);
	const exists = inspection !== null;
	if (exists && !replace) {
		throw new Error(
			`${client} already has an MCP server named 'auto'. Re-run with --replace after reviewing it.`,
		);
	}
	let claudeBackup: {
		configPath: string;
		backupPath: string;
		scope: "user" | "project" | "local";
	} | null = null;
	if (exists && client === "claude-code") {
		claudeBackup = await backupClaudeConfig(inspection);
		const removal = removalCommand(client, claudeBackup.scope);
		if (!removal) throw new Error(`${client} does not support safe replacement`);
		const removed = await runClientCommand(client, removal);
		if (removed.code !== 0) {
			try {
				await rename(claudeBackup.backupPath, claudeBackup.configPath);
			} catch (rollbackError) {
				throw new Error(
					`${client} removal failed (${removed.code}): ${removed.stderr.trim()}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
				);
			}
			throw new Error(
				`${client} removal failed (${removed.code}): ${removed.stderr.trim()}`,
			);
		}
	}
	const command = clientCommand(client, profileName, claudeBackup?.scope);
	if (!command) throw new Error(`${client} does not use a command installer`);
	let installed: Awaited<ReturnType<typeof runClientCommand>>;
	try {
		installed = await runClientCommand(client, command);
	} catch (error) {
		if (claudeBackup) {
			try {
				await rename(claudeBackup.backupPath, claudeBackup.configPath);
			} catch (rollbackError) {
				throw new AggregateError(
					[error, rollbackError],
					`${client} installer could not start and rollback failed`,
				);
			}
		}
		throw error;
	}
	if (installed.code !== 0) {
		if (claudeBackup) {
			try {
				await rename(claudeBackup.backupPath, claudeBackup.configPath);
			} catch (rollbackError) {
				throw new Error(
					`${client} installer failed (${installed.code}): ${installed.stderr.trim()}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
				);
			}
		}
		throw new Error(
			`${client} installer failed (${installed.code}): ${installed.stderr.trim()}`,
		);
	}
	if (claudeBackup) {
		await unlink(claudeBackup.backupPath);
	}
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	if (process.platform === "win32") return JSON.stringify(value);
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function printableConfig(client: ClientId, profileName: string): string {
	const command = clientCommand(client, profileName);
	if (command) {
		return [command.file, ...command.args].map(shellQuote).join(" ");
	}
	return JSON.stringify(
		{ [directServerKey(client)]: { auto: serverDefinition(profileName) } },
		null,
		2,
	);
}

export async function configureClients({
	profileName,
	clients,
	printOnly,
	replace,
}: ConfigureClientsOptions): Promise<void> {
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
