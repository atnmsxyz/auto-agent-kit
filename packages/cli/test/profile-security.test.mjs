import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { profilesPath, saveProfile } from "../dist/profiles.js";

test("profile storage waits for a fresh incomplete lock and recovers it once stale", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-stale-lock-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await mkdir(path.dirname(profilesPath()), { recursive: true });
		const lockPath = `${profilesPath()}.lock`;
		await writeFile(lockPath, "", "utf8");

		const freshSave = saveProfile("fresh-lock", {
			apiKey: "atk_fresh_lock_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const freshOutcome = await Promise.race([
			freshSave.then(() => "saved"),
			new Promise((resolve) => setTimeout(() => resolve("waiting"), 100)),
		]);
		assert.equal(freshOutcome, "waiting");
		assert.equal(await readFile(lockPath, "utf8"), "");
		await unlink(lockPath);
		await freshSave;

		await writeFile(lockPath, "{", "utf8");
		const staleAt = new Date(Date.now() - 60_000);
		await utimes(lockPath, staleAt, staleAt);
		await saveProfile("recovered", {
			apiKey: "atk_recovered_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read_write",
			surface: "trading",
		});

		const persisted = JSON.parse(await readFile(profilesPath(), "utf8"));
		assert.equal(persisted.activeProfile, "recovered");
		assert.equal(persisted.profiles.recovered.apiKey, "atk_recovered_key");
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("profile storage distinguishes a live long-running owner from a reused PID", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-reused-pid-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await mkdir(path.dirname(profilesPath()), { recursive: true });
		const lockPath = `${profilesPath()}.lock`;
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
		const liveOwnerSave = saveProfile("live-owner", {
			apiKey: "atk_live_owner_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const liveOwnerOutcome = await Promise.race([
			liveOwnerSave.then(() => "saved"),
			new Promise((resolve) => setTimeout(() => resolve("waiting"), 100)),
		]);
		assert.equal(liveOwnerOutcome, "waiting");
		await unlink(lockPath);
		await liveOwnerSave;

		await writeFile(
			lockPath,
			JSON.stringify({ pid: process.pid, startedAt: 0 }),
			"utf8",
		);
		await utimes(lockPath, staleAt, staleAt);
		await saveProfile("reused-pid", {
			apiKey: "atk_reused_pid_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});

		const persisted = JSON.parse(await readFile(profilesPath(), "utf8"));
		assert.equal(persisted.profiles["live-owner"].apiKey, "atk_live_owner_key");
		assert.equal(persisted.profiles["reused-pid"].apiKey, "atk_reused_pid_key");
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("profile storage recovers a stale recovery guard owned by a dead process", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-stale-recovery-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await mkdir(path.dirname(profilesPath()), { recursive: true });
		const recoveryPath = `${profilesPath()}.lock.recovery`;
		await writeFile(recoveryPath, JSON.stringify({ pid: 99_999_999 }), "utf8");
		const staleAt = new Date(Date.now() - 60_000);
		await utimes(recoveryPath, staleAt, staleAt);

		await saveProfile("recovered-guard", {
			apiKey: "atk_recovered_guard_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});

		const persisted = JSON.parse(await readFile(profilesPath(), "utf8"));
		assert.equal(persisted.activeProfile, "recovered-guard");
		assert.equal(
			persisted.profiles["recovered-guard"].apiKey,
			"atk_recovered_guard_key",
		);
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("profile storage preserves every save when 40 processes recover one abandoned lock", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-contention-"));
	const readyDirectory = path.join(home, "ready");
	const barrier = path.join(home, "start");
	await mkdir(path.dirname(path.join(home, ".auto", "mcp", "profiles.json")), {
		recursive: true,
	});
	await mkdir(readyDirectory);
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json.lock"),
		JSON.stringify({ pid: 99_999_999 }),
	);
	const moduleUrl = new URL("../dist/profiles.js", import.meta.url).href;
	const childScript = `
import { existsSync, writeFileSync } from "node:fs";
const { saveProfile } = await import(process.env.AUTO_MCP_PROFILE_MODULE);
writeFileSync(process.env.AUTO_MCP_READY_FILE, "ready");
while (!existsSync(process.env.AUTO_MCP_BARRIER)) {
	await new Promise((resolve) => setTimeout(resolve, 5));
}
const index = process.env.AUTO_MCP_INDEX;
await saveProfile("profile-" + index, {
	apiKey: "atk_contention_" + index,
	apiUrl: "https://auto.fun",
	accessPreset: "read",
	surface: "research",
});
`;
	const children = Array.from({ length: 40 }, (_, index) => {
		const child = spawn(
			process.execPath,
			["--input-type=module", "--eval", childScript],
			{
				env: {
					...process.env,
					HOME: home,
					AUTO_MCP_PROFILE_MODULE: moduleUrl,
					AUTO_MCP_READY_FILE: path.join(readyDirectory, String(index)),
					AUTO_MCP_BARRIER: barrier,
					AUTO_MCP_INDEX: String(index),
				},
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		return new Promise((resolve) => {
			child.once("exit", (code) => resolve({ code, stderr }));
		});
	});

	try {
		const readyDeadline = Date.now() + 10_000;
		while ((await readdir(readyDirectory)).length < 40) {
			if (Date.now() >= readyDeadline) throw new Error("children did not reach barrier");
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		await writeFile(barrier, "start");
		const outcomes = await Promise.all(children);
		assert.deepEqual(
			outcomes.filter(({ code }) => code !== 0),
			[],
			outcomes.map(({ stderr }) => stderr).filter(Boolean).join("\n"),
		);
		const persisted = JSON.parse(
			await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
		);
		assert.equal(Object.keys(persisted.profiles).length, 40);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("configure does not treat inherited object properties as saved profiles", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-prototype-"));
	const child = spawn(
		process.execPath,
		[
			"dist/index.js",
			"configure",
			"--profile",
			"constructor",
			"--install",
			"cursor",
			"--print-only",
		],
		{
			cwd: new URL("..", import.meta.url),
			env: { ...process.env, HOME: home },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString("utf8");
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString("utf8");
	});
	try {
		const code = await new Promise((resolve) => child.once("exit", resolve));
		assert.equal(code, 1);
		assert.match(stderr, /profile 'constructor' was not found/i);
		assert.equal(stdout, "");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("profile storage validates a candidate before replacing the credential store", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-validation-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await saveProfile("working", {
			apiKey: "atk_working_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const before = await readFile(profilesPath(), "utf8");
		await assert.rejects(
			saveProfile("invalid", {
				apiKey: "unexpected-prefix",
				apiUrl: "https://auto.fun",
				accessPreset: "read",
				surface: "research",
			}),
			/invalid/,
		);
		assert.equal(await readFile(profilesPath(), "utf8"), before);
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("profile rollback preserves a later successful profile revision", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-revision-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await saveProfile("working", {
			apiKey: "atk_working_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const rollbackEarlier = await saveProfile("earlier", {
			apiKey: "atk_earlier_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		await saveProfile("later", {
			apiKey: "atk_later_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read_write",
			surface: "trading",
		});

		await rollbackEarlier();

		const persisted = JSON.parse(await readFile(profilesPath(), "utf8"));
		assert.equal(persisted.activeProfile, "later");
		assert.equal(persisted.profiles.later.apiKey, "atk_later_key");
		assert.equal(persisted.profiles.working.apiKey, "atk_working_key");
		assert.equal(persisted.profiles.earlier, undefined);
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("profile rollback serializes with a concurrent successful save", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-concurrency-"));
	const originalHome = process.env.HOME;
	process.env.HOME = home;
	try {
		await saveProfile("working", {
			apiKey: "atk_working_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const rollbackEarlier = await saveProfile("earlier", {
			apiKey: "atk_earlier_key",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});

		await Promise.all([
			rollbackEarlier(),
			saveProfile("later", {
				apiKey: "atk_later_key",
				apiUrl: "https://auto.fun",
				accessPreset: "read_write",
				surface: "trading",
			}),
		]);

		const persisted = JSON.parse(await readFile(profilesPath(), "utf8"));
		assert.equal(persisted.profiles.later.apiKey, "atk_later_key");
		assert.equal(persisted.profiles.earlier, undefined);
		assert.equal(persisted.profiles.working.apiKey, "atk_working_key");
	} finally {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		await rm(home, { recursive: true, force: true });
	}
});

test("Windows profile storage removes every prior access rule and fails closed when ACL hardening fails", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-windows-acl-"));
	const home = path.join(root, "home");
	const bin = path.join(root, "bin");
	const log = path.join(root, "acl.log");
	await mkdir(home);
	await mkdir(bin);
	const powershell = path.join(bin, "powershell.exe");
	await writeFile(
		powershell,
		'#!/bin/sh\n[ "$#" -eq 5 ] || exit 2\nif [ -n "$AUTO_MCP_LOCK_PID" ]; then\n  printf "2026-01-01T00:00:00.000Z\\n"\n  exit 0\nfi\nprintf "%s|%s|%s|%s\\n" "$*" "$AUTO_MCP_ACL_TARGET" "$AUTO_MCP_ACL_PRINCIPAL" "$AUTO_MCP_ACL_DIRECTORY" >> "$ACL_LOG"\nif [ "$ACL_FAIL_FINAL" = "1" ]; then\n  case "$AUTO_MCP_ACL_TARGET" in\n    */profiles.json) exit 1 ;;\n  esac\nfi\nexit 0\n',
		"utf8",
	);
	await chmod(powershell, 0o755);

	const originalPlatform = process.platform;
	const originalEnv = { ...process.env };
	Object.defineProperty(process, "platform", { value: "win32" });
	Object.assign(process.env, {
		HOME: home,
		USERPROFILE: home,
		USERNAME: "test-user",
		USERDOMAIN: "TESTDOMAIN",
		PATH: bin,
		ACL_LOG: log,
	});

	try {
		await saveProfile("research", {
			apiKey: "atk_windows_acl_secret",
			apiUrl: "https://auto.fun",
			accessPreset: "read",
			surface: "research",
		});
		const aclCalls = (await readFile(log, "utf8")).trim().split("\n");
		assert.equal(aclCalls.length, 3);
		for (const call of aclCalls) {
			assert.match(call, /SetAccessRuleProtection/);
			assert.match(call, /RemoveAccessRuleSpecific/);
			assert.match(call, /AddAccessRule/);
			assert.match(call, /TESTDOMAIN\\test-user/);
		}
		assert.match(aclCalls[0], /[/\\]\.auto[/\\]mcp\|TESTDOMAIN\\test-user\|true/);
		assert.match(aclCalls[1], /profiles\.json\..*\.tmp\|TESTDOMAIN\\test-user\|false/);
		assert.match(aclCalls[2], /profiles\.json\|TESTDOMAIN\\test-user\|false/);

		const before = await readFile(profilesPath(), "utf8");
		process.env.ACL_FAIL_FINAL = "1";
		await assert.rejects(
			saveProfile("blocked", {
				apiKey: "atk_must_not_be_accepted",
				apiUrl: "https://auto.fun",
				accessPreset: "read",
				surface: "research",
			}),
			/Windows profile ACL hardening failed/,
		);
		assert.equal(await readFile(profilesPath(), "utf8"), before);
	} finally {
		Object.defineProperty(process, "platform", { value: originalPlatform });
		for (const key of Object.keys(process.env)) delete process.env[key];
		Object.assign(process.env, originalEnv);
		await rm(root, { recursive: true, force: true });
	}
});
