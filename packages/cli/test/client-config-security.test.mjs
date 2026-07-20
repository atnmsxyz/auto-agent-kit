import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { configureClients } from "../dist/installers.js";

test("Windows direct installers preserve the original config ACL and fail closed", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-config-acl-"));
	const home = path.join(root, "home");
	const bin = path.join(root, "bin");
	const aclLog = path.join(root, "acl.log");
	const configPath = path.join(home, ".cursor", "mcp.json");
	const original = `${JSON.stringify({ mcpServers: { other: { command: "other" } } }, null, 2)}\n`;
	await mkdir(path.dirname(configPath), { recursive: true });
	await mkdir(bin);
	await writeFile(configPath, original);
	await writeFile(aclLog, "");
	await writeFile(
		path.join(bin, "powershell.exe"),
		'#!/bin/sh\n[ "$#" -eq 5 ] || exit 2\nprintf "%s|%s|%s\\n" "$*" "$AUTO_MCP_ACL_SOURCE" "$AUTO_MCP_ACL_TARGET" >> "$ACL_LOG"\n[ "$ACL_FAIL" != "1" ]\n',
	);
	await chmod(path.join(bin, "powershell.exe"), 0o755);

	const originalPlatform = process.platform;
	const originalEnv = { ...process.env };
	Object.defineProperty(process, "platform", { value: "win32" });
	Object.assign(process.env, {
		HOME: home,
		USERPROFILE: home,
		PATH: bin,
		ACL_LOG: aclLog,
	});

	try {
		await configureClients({
			profileName: "research",
			clients: ["cursor"],
			printOnly: false,
			replace: false,
		});
		const aclCall = await readFile(aclLog, "utf8");
		assert.match(aclCall, /Get-Acl/);
		assert.match(aclCall, /mcp\.json\|/);
		assert.match(aclCall, /mcp\.json\|.*mcp\.json\.bak\./);
		assert.match(aclCall, /mcp\.json\..*\.tmp/);

		await writeFile(configPath, original);
		process.env.ACL_FAIL = "1";
		await assert.rejects(
			configureClients({
				profileName: "research",
				clients: ["cursor"],
				printOnly: false,
				replace: false,
			}),
			/Windows client config ACL preservation failed/,
		);
		assert.equal(await readFile(configPath, "utf8"), original);
	} finally {
		Object.defineProperty(process, "platform", { value: originalPlatform });
		for (const key of Object.keys(process.env)) delete process.env[key];
		Object.assign(process.env, originalEnv);
		await rm(root, { recursive: true, force: true });
	}
});

test("Windows Claude replacement preserves the source ACL on its temporary backup", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-claude-acl-"));
	const home = path.join(root, "home");
	const bin = path.join(root, "bin");
	const claudeConfigDir = path.join(home, "claude");
	const configPath = path.join(claudeConfigDir, ".claude.json");
	const aclLog = path.join(root, "acl.log");
	const original = `${JSON.stringify({ mcpServers: { auto: { command: "old" } } })}\n`;
	await mkdir(claudeConfigDir, { recursive: true });
	await mkdir(bin);
	await writeFile(configPath, original);
	await writeFile(aclLog, "");
	await writeFile(
		path.join(bin, "powershell.exe"),
		'#!/bin/sh\nprintf "%s|%s|%s\\n" "$*" "$AUTO_MCP_ACL_SOURCE" "$AUTO_MCP_ACL_TARGET" >> "$ACL_LOG"\n[ "$ACL_FAIL" != "1" ]\n',
	);
	await chmod(path.join(bin, "powershell.exe"), 0o755);
	const commandProcessor = path.join(bin, "fake-cmd");
	await writeFile(
		commandProcessor,
		'#!/bin/sh\ncase "$*" in\n  *" mcp get auto"*) printf "auto:\\n  Scope: User config (available in all your projects)\\n  Type: stdio\\n" ;;\nesac\n',
	);
	await chmod(commandProcessor, 0o755);

	const originalPlatform = process.platform;
	const originalEnv = { ...process.env };
	Object.defineProperty(process, "platform", { value: "win32" });
	Object.assign(process.env, {
		HOME: home,
		USERPROFILE: home,
		PATH: `${bin}${path.delimiter}${process.env.PATH}`,
		ComSpec: commandProcessor,
		CLAUDE_CONFIG_DIR: claudeConfigDir,
		ACL_LOG: aclLog,
	});

	try {
		await configureClients({
			profileName: "research",
			clients: ["claude-code"],
			printOnly: false,
			replace: true,
		});
		assert.match(
			await readFile(aclLog, "utf8"),
			/\.claude\.json\|.*\.claude\.json\.auto-mcp-backup\./,
		);

		await writeFile(configPath, original);
		process.env.ACL_FAIL = "1";
		await assert.rejects(
			configureClients({
				profileName: "research",
				clients: ["claude-code"],
				printOnly: false,
				replace: true,
			}),
			/Windows client config ACL preservation failed/,
		);
		assert.equal(await readFile(configPath, "utf8"), original);
		assert.deepEqual(await readdir(claudeConfigDir), [".claude.json"]);
	} finally {
		Object.defineProperty(process, "platform", { value: originalPlatform });
		for (const key of Object.keys(process.env)) delete process.env[key];
		Object.assign(process.env, originalEnv);
		await rm(root, { recursive: true, force: true });
	}
});
