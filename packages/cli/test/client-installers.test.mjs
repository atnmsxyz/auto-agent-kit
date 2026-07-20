import { spawn } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "jsonc-parser";

function run(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, options);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.once("error", reject);
		child.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function directConfigPaths(home) {
	const claudeDesktop =
		process.platform === "darwin"
			? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
			: process.platform === "win32"
				? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
				: path.join(home, ".config", "Claude", "claude_desktop_config.json");
	return {
		"claude-desktop": claudeDesktop,
		cursor: path.join(home, ".cursor", "mcp.json"),
		windsurf: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
		vscode:
			process.platform === "darwin"
				? path.join(home, "Library", "Application Support", "Code", "User", "mcp.json")
				: process.platform === "win32"
					? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Code", "User", "mcp.json")
					: path.join(home, ".config", "Code", "User", "mcp.json"),
		gemini: path.join(home, ".gemini", "settings.json"),
	};
}

function serverKey(client) {
	return client === "vscode" ? "servers" : "mcpServers";
}

test("configure installs profile-backed MCP entries for every supported client without exposing the key", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-installers-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "client-commands.jsonl");
	const apiKey = "atk_never_write_this_to_client_config";
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "perps-bot",
			profiles: {
				"perps-bot": {
					apiKey,
					apiUrl: "https://auto.test",
					accessPreset: "read_write",
					surface: "perps",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);

	await mkdir(fakeBin, { recursive: true });
const fakeClient = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify({ client: basename(process.argv[1]), args }) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	process.stderr.write("MCP server auto not found\\n");
	process.exit(1);
}
`;
	for (const client of ["claude", "codex", "code", "gemini"]) {
		const executable = path.join(fakeBin, client);
		await writeFile(executable, fakeClient);
		await chmod(executable, 0o755);
	}

	for (const [client, configPath] of Object.entries(directConfigPaths(home))) {
		const key = serverKey(client);
		await mkdir(path.dirname(configPath), { recursive: true });
		await writeFile(
			configPath,
			client === "vscode"
				? `{
	// VS Code accepts JSON with comments and trailing commas.
	"theme": "dark",
	"${key}": {
		"other": { "command": "other-server", "args": [] },
	},
}
`
				: JSON.stringify({
						theme: "dark",
						[key]: {
							other: { command: "other-server", args: [] },
						},
					}),
		);
	}

	const packageRoot = new URL("..", import.meta.url);
	const env = {
		...process.env,
		HOME: home,
		PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
		AUTO_MCP_COMMAND_LOG: commandLog,
	};

	try {
		const configured = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"perps-bot",
				"--install",
				"all",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(configured.code, 0, configured.stderr);
		assert.doesNotMatch(`${configured.stdout}${configured.stderr}`, new RegExp(apiKey));

		for (const [client, configPath] of Object.entries(directConfigPaths(home))) {
			const contents = await readFile(configPath, "utf8");
			if (client === "vscode") {
				assert.match(
					contents,
					/\/\/ VS Code accepts JSON with comments and trailing commas\./,
				);
			}
			const config = client === "vscode" ? parse(contents) : JSON.parse(contents);
			const key = serverKey(client);
			assert.equal(config.theme, "dark");
			assert.deepEqual(config[key].other, {
				command: "other-server",
				args: [],
			});
			assert.deepEqual(config[key].auto, {
				command: process.platform === "win32" ? "cmd" : "npx",
				args:
					process.platform === "win32"
						? ["/c", "npx", "-y", "@atnms/auto-mcp@0.4.0"]
						: ["-y", "@atnms/auto-mcp@0.4.0"],
				env: { AUTO_MCP_PROFILE: "perps-bot" },
			});
			assert.doesNotMatch(contents, new RegExp(apiKey));
			const siblings = await readdir(path.dirname(configPath));
			assert.ok(
				siblings.some((name) => name.startsWith(`${path.basename(configPath)}.bak.`)),
				`missing backup for ${configPath}`,
			);
		}

		const calls = (await readFile(commandLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			calls.map((call) => call.client).sort(),
			["claude", "claude", "codex", "codex"],
		);
		const installerCalls = calls.filter(
			(call) => !(call.args[0] === "mcp" && call.args[1] === "get"),
		);
		assert.equal(installerCalls.length, 2);
		for (const call of installerCalls) {
			const serialized = JSON.stringify(call);
			assert.match(serialized, /AUTO_MCP_PROFILE/);
			assert.match(serialized, /perps-bot/);
			assert.doesNotMatch(serialized, new RegExp(apiKey));
		}

		const beforePrintOnly = await Promise.all(
			Object.values(directConfigPaths(home)).map((configPath) =>
				readFile(configPath, "utf8"),
			),
		);
		const beforeCommandLog = await readFile(commandLog, "utf8");
		const printed = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"perps-bot",
				"--install",
				"all",
				"--print-only",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(printed.code, 0, printed.stderr);
		assert.match(printed.stdout, /AUTO_MCP_PROFILE/);
		assert.doesNotMatch(printed.stdout, new RegExp(apiKey));
		assert.deepEqual(
			await Promise.all(
				Object.values(directConfigPaths(home)).map((configPath) =>
					readFile(configPath, "utf8"),
				),
			),
			beforePrintOnly,
		);
		assert.equal(await readFile(commandLog, "utf8"), beforeCommandLog);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("Windows command clients run their command shims through cmd.exe", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-windows-shim-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "cmd-invocations.jsonl");
	const platformHook = path.join(home, "win32-platform.mjs");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(fakeBin);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_windows_shim_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(
		platformHook,
		'Object.defineProperty(process, "platform", { value: "win32" });\n',
	);
	const commandProcessor = path.join(fakeBin, "fake-cmd");
	await writeFile(
		commandProcessor,
		`#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args.includes("get")) {
	process.stderr.write("No MCP server named auto found.\\n");
	process.exit(1);
}
`,
	);
	await chmod(commandProcessor, 0o755);

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"codex",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					USERPROFILE: home,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					NODE_OPTIONS: `--import=${platformHook}`,
					ComSpec: commandProcessor,
					AUTO_MCP_COMMAND_LOG: commandLog,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		const calls = (await readFile(commandLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(calls.length, 2);
		assert.deepEqual(calls[0].slice(0, 6), [
			"/d",
			"/s",
			"/c",
			"codex",
			"mcp",
			"get",
		]);
		assert.deepEqual(calls[1].slice(0, 7), [
			"/d",
			"/s",
			"/c",
			"codex",
			"mcp",
			"add",
			"auto",
		]);
		assert.doesNotMatch(await readFile(commandLog, "utf8"), /atk_/);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("VS Code installation updates the same default user profile it inspects", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-vscode-profile-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "vscode-command.json");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const defaultConfigPath = directConfigPaths(home).vscode;
	const defaultConfig = '{"servers":{"existing":{"command":"keep"}}}\n';
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(path.dirname(defaultConfigPath), { recursive: true });
	await mkdir(fakeBin);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_vscode_profile_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(defaultConfigPath, defaultConfig);
	await writeFile(
		path.join(fakeBin, "code"),
		`#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(process.argv.slice(2)));
`,
	);
	await chmod(path.join(fakeBin, "code"), 0o755);

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"vscode",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					AUTO_MCP_COMMAND_LOG: commandLog,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		const configured = JSON.parse(await readFile(defaultConfigPath, "utf8"));
		assert.deepEqual(configured.servers.existing, { command: "keep" });
		assert.deepEqual(configured.servers.auto, {
			command: process.platform === "win32" ? "cmd" : "npx",
			args:
				process.platform === "win32"
					? ["/c", "npx", "-y", "@atnms/auto-mcp@0.4.0"]
					: ["-y", "@atnms/auto-mcp@0.4.0"],
			env: { AUTO_MCP_PROFILE: "research" },
		});
		await assert.rejects(readFile(commandLog, "utf8"), { code: "ENOENT" });
		assert.doesNotMatch(JSON.stringify(configured), /atk_/);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("VS Code installation honors XDG_CONFIG_HOME on Linux", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-vscode-xdg-"));
	const home = path.join(root, "home");
	const xdgConfigHome = path.join(root, "xdg-config");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const configPath = path.join(xdgConfigHome, "Code", "User", "mcp.json");
	const defaultConfigPath = path.join(
		home,
		".config",
		"Code",
		"User",
		"mcp.json",
	);
	const linuxPlatformOverride = path.join(root, "linux-platform.mjs");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(path.dirname(configPath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_vscode_xdg_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(
		configPath,
		JSON.stringify({ servers: { existing: { command: "keep" } } }),
	);
	await writeFile(
		linuxPlatformOverride,
		'Object.defineProperty(process, "platform", { value: "linux" });\n',
	);

	try {
		const result = await run(
			process.execPath,
			[
				"--import",
				linuxPlatformOverride,
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"vscode",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					XDG_CONFIG_HOME: xdgConfigHome,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		const configured = JSON.parse(await readFile(configPath, "utf8"));
		assert.deepEqual(configured.servers.existing, { command: "keep" });
		assert.equal(configured.servers.auto.env.AUTO_MCP_PROFILE, "research");
		assert.doesNotMatch(JSON.stringify(configured), /atk_/);
		await assert.rejects(readFile(defaultConfigPath, "utf8"), { code: "ENOENT" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("VS Code installation refuses an existing Auto server until replacement is explicit", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-vscode-collision-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "vscode-command.jsonl");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const configPath = directConfigPaths(home).vscode;
	const originalConfig = {
		servers: {
			auto: { command: "keep-until-explicitly-replaced" },
			other: { command: "other-server" },
		},
	};
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(path.dirname(configPath), { recursive: true });
	await mkdir(fakeBin);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_vscode_collision_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(configPath, `${JSON.stringify(originalConfig, null, 2)}\n`);
	await writeFile(
		path.join(fakeBin, "code"),
		`#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
`,
	);
	await chmod(path.join(fakeBin, "code"), 0o755);

	const args = [
		"dist/index.js",
		"configure",
		"--profile",
		"research",
		"--install",
		"vscode",
	];
	const options = {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			HOME: home,
			PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
			AUTO_MCP_COMMAND_LOG: commandLog,
		},
		stdio: ["ignore", "pipe", "pipe"],
	};

	try {
		const refused = await run(process.execPath, args, options);
		assert.equal(refused.code, 1);
		assert.match(refused.stderr, /already has an MCP server named 'auto'/);
		await assert.rejects(readFile(commandLog, "utf8"), { code: "ENOENT" });
		assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), originalConfig);

		const replaced = await run(process.execPath, [...args, "--replace"], options);
		assert.equal(replaced.code, 0, replaced.stderr);
		await assert.rejects(readFile(commandLog, "utf8"), { code: "ENOENT" });
		const nextConfig = JSON.parse(await readFile(configPath, "utf8"));
		assert.deepEqual(nextConfig.servers.other, originalConfig.servers.other);
		assert.equal(nextConfig.servers.auto.env.AUTO_MCP_PROFILE, "research");
		assert.doesNotMatch(JSON.stringify(nextConfig), /atk_/);
		const siblings = await readdir(path.dirname(configPath));
		assert.equal(
			siblings.filter((name) => name.startsWith("mcp.json.bak.")).length,
			1,
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure refuses an existing Auto entry until replacement is explicit", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-collision-"));
	const apiKey = "atk_never_expose_collision_secret";
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const cursorConfigPath = directConfigPaths(home).cursor;
	const originalConfig = {
		theme: "dark",
		mcpServers: {
			auto: { command: "old-auto", args: ["--keep-until-replaced"] },
			other: { command: "other-server", args: [] },
		},
	};
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey,
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await mkdir(path.dirname(cursorConfigPath), { recursive: true });
	await writeFile(cursorConfigPath, `${JSON.stringify(originalConfig, null, 2)}\n`);

	const packageRoot = new URL("..", import.meta.url);
	const env = { ...process.env, HOME: home };
	try {
		const refused = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"cursor",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(refused.code, 1);
		assert.match(refused.stderr, /already has an MCP server named 'auto'/);
		assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, new RegExp(apiKey));
		assert.deepEqual(JSON.parse(await readFile(cursorConfigPath, "utf8")), originalConfig);

		const replaced = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"cursor",
				"--replace",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(replaced.code, 0, replaced.stderr);
		const nextConfig = JSON.parse(await readFile(cursorConfigPath, "utf8"));
		assert.deepEqual(nextConfig.mcpServers.other, originalConfig.mcpServers.other);
		assert.equal(nextConfig.mcpServers.auto.env.AUTO_MCP_PROFILE, "research");
		assert.doesNotMatch(JSON.stringify(nextConfig), new RegExp(apiKey));
		const siblings = await readdir(path.dirname(cursorConfigPath));
		assert.equal(
			siblings.filter((name) => name.startsWith("mcp.json.bak.")).length,
			1,
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("concurrent configure calls cannot overwrite another initial direct install", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-concurrent-install-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const cursorConfigPath = directConfigPaths(home).cursor;
	const profiles = Object.fromEntries(
		Array.from({ length: 8 }, (_, index) => [
			`profile-${index}`,
			{
				apiKey: `atk_concurrent_${index}`,
				apiUrl: "https://auto.fun",
				accessPreset: "read",
				surface: "research",
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		]),
	);
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({ version: 1, activeProfile: "profile-0", profiles }),
		{ mode: 0o600 },
	);
	await mkdir(path.dirname(cursorConfigPath), { recursive: true });
	await writeFile(
		cursorConfigPath,
		JSON.stringify({ padding: "x".repeat(12_000_000), mcpServers: {} }),
	);

	const packageRoot = new URL("..", import.meta.url);
	try {
		const outcomes = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				run(
					process.execPath,
					[
						"dist/index.js",
						"configure",
						"--profile",
						`profile-${index}`,
						"--install",
						"cursor",
					],
					{
						cwd: packageRoot,
						env: { ...process.env, HOME: home },
						stdio: ["ignore", "pipe", "pipe"],
					},
				),
			),
		);
		assert.equal(outcomes.filter(({ code }) => code === 0).length, 1);
		for (const outcome of outcomes.filter(({ code }) => code !== 0)) {
			assert.match(outcome.stderr, /already has an MCP server named 'auto'/);
		}
		const configured = JSON.parse(await readFile(cursorConfigPath, "utf8"));
		assert.match(
			configured.mcpServers.auto.env.AUTO_MCP_PROFILE,
			/^profile-[0-7]$/,
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure preserves a live long-running lock and recovers a reused PID", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-config-reused-pid-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const cursorConfigPath = directConfigPaths(home).cursor;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_config_reused_pid",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await mkdir(path.dirname(cursorConfigPath), { recursive: true });
	const lockPath = `${cursorConfigPath}.auto.lock`;
	await writeFile(
		lockPath,
		JSON.stringify({
			pid: process.pid,
			startedAt: Date.now() - process.uptime() * 1_000,
		}),
		"utf8",
	);
	const staleAt = new Date(Date.now() - 60_000);
	await utimes(lockPath, staleAt, staleAt);

	try {
		const liveOwnerChild = spawn(
			process.execPath,
			["dist/index.js", "configure", "--profile", "research", "--install", "cursor"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const liveOwnerOutcome = await Promise.race([
			new Promise((resolve) =>
				liveOwnerChild.once("close", (code) => resolve({ closed: true, code })),
			),
			new Promise((resolve) =>
				setTimeout(() => resolve({ closed: false, code: null }), 150),
			),
		]);
		assert.equal(liveOwnerOutcome.closed, false);
		liveOwnerChild.kill("SIGTERM");
		if (!liveOwnerOutcome.closed) {
			await new Promise((resolve) => liveOwnerChild.once("close", resolve));
		}

		await writeFile(
			lockPath,
			JSON.stringify({ pid: process.pid, startedAt: 0 }),
			"utf8",
		);
		await utimes(lockPath, staleAt, staleAt);
		const result = await run(
			process.execPath,
			["dist/index.js", "configure", "--profile", "research", "--install", "cursor"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		const configured = JSON.parse(await readFile(cursorConfigPath, "utf8"));
		assert.equal(configured.mcpServers.auto.env.AUTO_MCP_PROFILE, "research");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure rejects a missing flag value before touching client config", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-missing-flag-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const cursorConfigPath = directConfigPaths(home).cursor;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "trading",
			profiles: {
				trading: {
					apiKey: "atk_must_not_be_selected",
					apiUrl: "https://auto.test",
					accessPreset: "read_write",
					surface: "trading",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);

	const packageRoot = new URL("..", import.meta.url);
	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--install",
				"cursor",
				"--profile",
			],
			{
				cwd: packageRoot,
				env: { ...process.env, HOME: home },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /--profile requires a value/);
		await assert.rejects(readFile(cursorConfigPath, "utf8"), { code: "ENOENT" });
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure rejects an unknown flag before touching client config", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-unknown-flag-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const cursorConfigPath = directConfigPaths(home).cursor;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_must_not_configure",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"cursor",
				"--print-onyl",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /unknown option.*--print-onyl/i);
		await assert.rejects(readFile(cursorConfigPath, "utf8"), { code: "ENOENT" });
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure preflights command clients and replaces only when explicitly requested", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-command-collision-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "client-commands.jsonl");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_command_collision_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await mkdir(fakeBin, { recursive: true });
	await writeFile(
		path.join(home, ".claude.json"),
		`${JSON.stringify({ mcpServers: { auto: { command: "old-auto" } } })}\n`,
	);
const fakeClient = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify({ client: basename(process.argv[1]), args }) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	if (basename(process.argv[1]) === "claude") {
		process.stdout.write("auto:\\n  Scope: Local config (private to this project)\\n  Type: stdio\\n");
	}
	process.exit(0);
}
if (args[0] === "mcp" && args[1] === "remove" && !args.includes("local")) {
	process.stderr.write("Expected local scope\\n");
	process.exit(2);
}
`;
	for (const client of ["claude", "codex"]) {
		const executable = path.join(fakeBin, client);
		await writeFile(executable, fakeClient);
		await chmod(executable, 0o755);
	}

	const packageRoot = new URL("..", import.meta.url);
	const env = {
		...process.env,
		HOME: home,
		PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
		AUTO_MCP_COMMAND_LOG: commandLog,
	};
	try {
		for (const client of ["claude-code", "codex"]) {
			await rm(commandLog, { force: true });
			const refused = await run(
				process.execPath,
				[
					"dist/index.js",
					"configure",
					"--profile",
					"research",
					"--install",
					client,
				],
				{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
			);
			assert.equal(refused.code, 1, `${client}: ${refused.stderr}`);
			assert.match(refused.stderr, /already has an MCP server named 'auto'/);
			let calls = (await readFile(commandLog, "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args.slice(0, 3), ["mcp", "get", "auto"]);

			await rm(commandLog, { force: true });
			const replaced = await run(
				process.execPath,
				[
					"dist/index.js",
					"configure",
					"--profile",
					"research",
					"--install",
					client,
					"--replace",
				],
				{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
			);
			assert.equal(replaced.code, 0, `${client}: ${replaced.stderr}`);
			calls = (await readFile(commandLog, "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert.equal(calls.length, client === "claude-code" ? 3 : 2);
			assert.deepEqual(calls[0].args.slice(0, 3), ["mcp", "get", "auto"]);
			if (client === "claude-code") {
				assert.equal(calls[1].args[1], "remove");
				assert.deepEqual(calls[1].args, ["mcp", "remove", "auto", "--scope", "local"]);
				assert.match(calls[2].args.join(" "), /mcp add/);
				assert.deepEqual(calls[2].args.slice(2, 4), ["--scope", "local"]);
			} else {
				assert.match(calls[1].args.join(" "), /mcp add/);
			}
		}
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("concurrent Codex configuration serializes collision detection and installation", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-codex-concurrent-"));
	const fakeBin = path.join(home, "bin");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const marker = path.join(home, "codex-installed");
	const commandLog = path.join(home, "codex-commands.jsonl");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(fakeBin);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_codex_concurrent_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(
		path.join(fakeBin, "codex"),
		`#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	await new Promise((resolve) => setTimeout(resolve, 300));
	if (existsSync(process.env.AUTO_MCP_INSTALL_MARKER)) {
		process.stdout.write('{"name":"auto"}\\n');
		process.exit(0);
	}
	process.stderr.write("No MCP server named 'auto' found.\\n");
	process.exit(1);
}
if (args[0] === "mcp" && args[1] === "add") {
	writeFileSync(process.env.AUTO_MCP_INSTALL_MARKER, "installed");
}
`,
	);
	await chmod(path.join(fakeBin, "codex"), 0o755);
	const args = [
		"dist/index.js",
		"configure",
		"--profile",
		"research",
		"--install",
		"codex",
	];
	const options = {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			HOME: home,
			PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
			AUTO_MCP_COMMAND_LOG: commandLog,
			AUTO_MCP_INSTALL_MARKER: marker,
		},
		stdio: ["ignore", "pipe", "pipe"],
	};

	try {
		const results = await Promise.all([
			run(process.execPath, args, options),
			run(process.execPath, args, options),
		]);
		assert.deepEqual(
			results.map(({ code }) => code).sort(),
			[0, 1],
		);
		assert.match(
			results.find(({ code }) => code === 1).stderr,
			/already has an MCP server named 'auto'/,
		);
		const calls = (await readFile(commandLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(
			calls.filter((call) => call[0] === "mcp" && call[1] === "add").length,
			1,
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("Claude replacement finds a project-scoped config from a nested directory", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-project-scope-"));
	const home = path.join(root, "home");
	const project = path.join(root, "project");
	const nested = path.join(project, "packages", "agent");
	const fakeBin = path.join(root, "bin");
	const commandLog = path.join(root, "client-commands.jsonl");
	await mkdir(path.join(home, ".auto", "mcp"), { recursive: true });
	await mkdir(nested, { recursive: true });
	await mkdir(fakeBin, { recursive: true });
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json"),
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_project_scope_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	const projectConfig = path.join(project, ".mcp.json");
	const originalConfig = { mcpServers: { auto: { command: "old-auto" }, other: { command: "other" } } };
	await writeFile(projectConfig, `${JSON.stringify(originalConfig, null, 2)}\n`, { mode: 0o600 });
	await writeFile(
		path.join(fakeBin, "claude"),
		`#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	process.stdout.write("auto:\\n  Scope: Project config (shared via .mcp.json)\\n  Type: stdio\\n");
}
`,
	);
	await chmod(path.join(fakeBin, "claude"), 0o755);

	try {
		const result = await run(
			process.execPath,
			[
				new URL("../dist/index.js", import.meta.url).pathname,
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--replace",
			],
			{
				cwd: nested,
				env: {
					...process.env,
					HOME: home,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					AUTO_MCP_COMMAND_LOG: commandLog,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		const calls = (await readFile(commandLog, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		assert.deepEqual(calls[1], ["mcp", "remove", "auto", "--scope", "project"]);
		assert.deepEqual(calls[2].slice(0, 4), ["mcp", "add-json", "--scope", "project"]);
		assert.deepEqual(JSON.parse(await readFile(projectConfig, "utf8")), originalConfig);
		assert.deepEqual((await readdir(project)).sort(), [".mcp.json", "packages"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Claude replacement restores the exact custom-dir config when the new add fails", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-command-rollback-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "client-commands.jsonl");
	const claudeConfigDir = path.join(home, "custom-claude");
	const claudeConfigPath = path.join(claudeConfigDir, ".claude.json");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const originalConfig = `${JSON.stringify({
		mcpServers: {
			auto: {
				command: "old-command",
				args: ["--keep", "exactly"],
				env: { OLD_SECRET: "preserve-without-logging" },
			},
		},
	}, null, 2)}\n`;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(claudeConfigDir);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_command_rollback_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(claudeConfigPath, originalConfig, { mode: 0o600 });
	await mkdir(fakeBin);
	await writeFile(
		path.join(fakeBin, "claude"),
		`#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	process.stdout.write("auto:\\n  Scope: User config (available in all your projects)\\n  Type: stdio\\n");
	process.exit(0);
}
if (args[0] === "mcp" && args[1] === "remove") {
	writeFileSync(process.env.AUTO_MCP_CLAUDE_CONFIG, '{"mcpServers":{}}\\n');
	process.exit(0);
}
process.stderr.write("simulated add failure\\n");
process.exit(3);
`,
	);
	await chmod(path.join(fakeBin, "claude"), 0o755);

	const packageRoot = new URL("..", import.meta.url);
	const env = {
		...process.env,
		HOME: home,
		PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
		CLAUDE_CONFIG_DIR: claudeConfigDir,
		AUTO_MCP_COMMAND_LOG: commandLog,
		AUTO_MCP_CLAUDE_CONFIG: claudeConfigPath,
	};
	try {
		const replaced = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--replace",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(replaced.code, 1);
		assert.match(replaced.stderr, /simulated add failure/);
		assert.equal(await readFile(claudeConfigPath, "utf8"), originalConfig);
		await assert.rejects(readFile(path.join(home, ".claude.json"), "utf8"), {
			code: "ENOENT",
		});
		const calls = (await readFile(commandLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			calls.map((args) => args[1]),
			["get", "remove", "add-json"],
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("Claude replacement restores the exact custom-dir config when removal fails", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-removal-rollback-"));
	const fakeBin = path.join(home, "bin");
	const commandLog = path.join(home, "client-commands.jsonl");
	const claudeConfigDir = path.join(home, "custom-claude");
	const claudeConfigPath = path.join(claudeConfigDir, ".claude.json");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const originalConfig = `${JSON.stringify({
		mcpServers: {
			auto: { command: "old-command", args: ["--keep"] },
			other: { command: "unrelated-server" },
		},
	}, null, 2)}\n`;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await mkdir(claudeConfigDir);
	await mkdir(fakeBin);
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_removal_rollback_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(claudeConfigPath, originalConfig, { mode: 0o600 });
	await writeFile(
		path.join(fakeBin, "claude"),
		`#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.AUTO_MCP_COMMAND_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "mcp" && args[1] === "get") {
	process.stdout.write("auto:\\n  Scope: User config (available in all your projects)\\n  Type: stdio\\n");
	process.exit(0);
}
if (args[0] === "mcp" && args[1] === "remove") {
	writeFileSync(process.env.AUTO_MCP_CLAUDE_CONFIG, '{"mcpServers":{"other":{"command":"unrelated-server"}}}\\n');
	process.stderr.write("simulated removal failure\\n");
	process.exit(3);
}
process.exit(0);
`,
	);
	await chmod(path.join(fakeBin, "claude"), 0o755);

	try {
		const replaced = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--replace",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					CLAUDE_CONFIG_DIR: claudeConfigDir,
					AUTO_MCP_COMMAND_LOG: commandLog,
					AUTO_MCP_CLAUDE_CONFIG: claudeConfigPath,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(replaced.code, 1);
		assert.match(replaced.stderr, /simulated removal failure/);
		assert.equal(await readFile(claudeConfigPath, "utf8"), originalConfig);
		const calls = (await readFile(commandLog, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			calls.map((args) => args[1]),
			["get", "remove"],
		);
		assert.deepEqual(await readdir(claudeConfigDir), [".claude.json"]);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("Claude replacement restores the prior config when the add cannot spawn", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-command-spawn-rollback-"));
	const fakeBin = path.join(home, "bin");
	const claudeConfigPath = path.join(home, ".claude.json");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const originalConfig = `${JSON.stringify({
		mcpServers: { auto: { command: "old-command", args: ["--keep"] } },
	}, null, 2)}\n`;
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_spawn_rollback_secret",
					apiUrl: "https://auto.fun",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(claudeConfigPath, originalConfig, { mode: 0o600 });
	await mkdir(fakeBin);
	await writeFile(
		path.join(fakeBin, "claude"),
		`#!/bin/sh
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
	printf 'auto:\\n  Scope: User config (available in all your projects)\\n  Type: stdio\\n'
	exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "remove" ]; then
	printf '{"mcpServers":{}}\\n' > "$AUTO_MCP_CLAUDE_CONFIG"
	/bin/rm "$0"
	exit 0
fi
`,
	);
	await chmod(path.join(fakeBin, "claude"), 0o755);

	try {
		const replaced = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--replace",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					PATH: fakeBin,
					AUTO_MCP_CLAUDE_CONFIG: claudeConfigPath,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(replaced.code, 1);
		assert.match(replaced.stderr, /not installed or is not on PATH/i);
		assert.equal(await readFile(claudeConfigPath, "utf8"), originalConfig);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("print-only command preserves its JSON argument when pasted into a shell", async (t) => {
	if (process.platform === "win32") {
		t.skip("POSIX shell quoting is not applicable on Windows");
		return;
	}
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-print-only-"));
	const fakeBin = path.join(home, "bin");
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_print_only_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await mkdir(fakeBin, { recursive: true });
	await writeFile(
		path.join(fakeBin, "claude"),
		`#!/usr/bin/env node
const value = process.argv.at(-1);
const parsed = JSON.parse(value);
if (parsed.env.AUTO_MCP_PROFILE !== "research") process.exit(2);
`,
	);
	await chmod(path.join(fakeBin, "claude"), 0o755);

	const packageRoot = new URL("..", import.meta.url);
	const env = {
		...process.env,
		HOME: home,
		PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
	};
	try {
		const printed = await run(
			process.execPath,
			[
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--print-only",
			],
			{ cwd: packageRoot, env, stdio: ["ignore", "pipe", "pipe"] },
		);
		assert.equal(printed.code, 0, printed.stderr);
		const command = printed.stdout.trim().split("\n").at(-1);
		const pasted = await run("sh", ["-c", command], {
			cwd: packageRoot,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		assert.equal(pasted.code, 0, pasted.stderr);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("Windows print-only command emits a PowerShell-safe JSON argument", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-powershell-print-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const platformHook = path.join(home, "win32-platform.mjs");
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(
		profilePath,
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_powershell_print_secret",
					apiUrl: "https://auto.test",
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-07-16T00:00:00.000Z",
					updatedAt: "2026-07-16T00:00:00.000Z",
				},
			},
		}),
		{ mode: 0o600 },
	);
	await writeFile(
		platformHook,
		'Object.defineProperty(process, "platform", { value: "win32" });\n',
	);

	try {
		const printed = await run(
			process.execPath,
			[
				"--import",
				platformHook,
				"dist/index.js",
				"configure",
				"--profile",
				"research",
				"--install",
				"claude-code",
				"--print-only",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, USERPROFILE: home },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(printed.code, 0, printed.stderr);
		const command = printed.stdout.trim().split("\n").at(-1);
		const match = command.match(
			/^claude mcp add-json --scope user auto '((?:[^']|'')+)'$/,
		);
		assert.ok(match, command);
		const definition = JSON.parse(match[1].replaceAll("''", "'"));
		assert.equal(definition.type, "stdio");
		assert.equal(definition.env.AUTO_MCP_PROFILE, "research");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
