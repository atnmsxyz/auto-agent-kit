import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";

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

function writeJson(proc, message) {
	proc.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitForJsonLine(proc, id) {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const onData = (chunk) => {
			buffer += chunk.toString("utf8");
			for (;;) {
				const index = buffer.indexOf("\n");
				if (index === -1) break;
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (!line.startsWith("{")) continue;
				const parsed = JSON.parse(line);
				if (parsed.id === id) {
					proc.stdout.off("data", onData);
					resolve(parsed);
				}
			}
		};
		proc.stdout.on("data", onData);
		proc.once("close", (code) => reject(new Error(`child exited ${code}`)));
	});
}

test("setup securely stores a named profile and tolerates an unavailable browser opener", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-setup-"));
	const apiKey = "atk_profile_secret_value";
	let acknowledged = false;
	let gatewayApiKey = null;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (
			req.method === "POST" &&
			req.url === "/api/auth/mcp-setup/authorizations"
		) {
			res.statusCode = 201;
			res.end(
				JSON.stringify({
					success: true,
					data: {
						deviceCode: "device-code-that-is-long-enough-for-validation",
						userCode: "ABCD-EFGH",
						verificationUri:
							"https://auto.test/settings/mcp-setup?user_code=ABCD-EFGH",
						expiresAt: Date.now() + 60_000,
						intervalSeconds: 0.001,
						profile: {
							id: "perps",
							name: "Perps trading",
							accessPreset: "read_write",
							surface: "perps",
						},
					},
				}),
			);
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(
				JSON.stringify({
					success: true,
					data: {
						apiKey,
						profile: {
							id: "perps",
							name: "Perps trading",
							accessPreset: "read_write",
							surface: "perps",
						},
					},
				}),
			);
			return;
		}
		if (
			req.method === "POST" &&
			req.url === "/api/auth/mcp-setup/acknowledge"
		) {
			acknowledged = true;
			res.end(JSON.stringify({ success: true, data: { status: "completed" } }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=perps") {
			gatewayApiKey = req.headers["x-auto-api-key"];
			res.end(
				JSON.stringify({
					success: true,
					data: {
						tools: [
							{
								name: "HYPERLIQUID_PLACE_ORDER",
								description: "Place a perpetual order",
								inputSchema: { type: "object", properties: {} },
								write: true,
								categories: ["perps"],
							},
						],
					},
				}),
			);
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	const apiUrl = `http://127.0.0.1:${port}`;
	const packageRoot = new URL("..", import.meta.url);
	const mcpPackageRoot = new URL("../../mcp/", import.meta.url);

	try {
		const setup = await run(
			process.execPath,
			[
				"dist/index.js",
				"setup",
				"--profile",
				"perps-bot",
				"--preset",
				"perps",
				"--client",
				"codex",
			],
			{
				cwd: packageRoot,
				env: { ...process.env, HOME: home, AUTO_API_URL: apiUrl, PATH: "" },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(setup.code, 0, setup.stderr);
		assert.match(setup.stdout, /Open Auto in your browser/);
		assert.match(setup.stdout, /Verified 1 tool \(1 write\) on the Perps trading profile/);
		assert.doesNotMatch(`${setup.stdout}${setup.stderr}`, new RegExp(apiKey));
		assert.equal(acknowledged, true);

		const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
		const profileFile = JSON.parse(await readFile(profilePath, "utf8"));
		assert.equal(profileFile.activeProfile, "perps-bot");
		assert.deepEqual(profileFile.profiles["perps-bot"], {
			apiKey,
			apiUrl,
			accessPreset: "read_write",
			surface: "perps",
			createdAt: profileFile.profiles["perps-bot"].createdAt,
			updatedAt: profileFile.profiles["perps-bot"].updatedAt,
		});
		assert.equal((await stat(profilePath)).mode & 0o777, 0o600);

		const child = spawn(process.execPath, ["dist/index.js", "--profile", "perps-bot"], {
			cwd: mcpPackageRoot,
				env: {
					...process.env,
					HOME: home,
					AUTO_API_KEY: "",
					AUTO_API_URL: "",
					AUTO_MCP_CATEGORIES: "",
					AUTO_MCP_GATEWAY_CATEGORIES: "",
					AUTO_MCP_SURFACE: "",
				},
			stdio: ["pipe", "pipe", "pipe"],
		});
		try {
			writeJson(child, {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "node-test", version: "0.0.0" },
				},
			});
			await waitForJsonLine(child, 1);
			writeJson(child, {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			});
			const listed = await waitForJsonLine(child, 2);
			assert.equal(gatewayApiKey, apiKey);
			assert.equal(listed.result.tools[0].name, "HYPERLIQUID_PLACE_ORDER");
		} finally {
			child.kill("SIGTERM");
		}
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup rejects unsupported installers before creating an authorization", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-invalid-client-"));
	let requests = 0;
	const server = http.createServer((_req, res) => {
		requests += 1;
		res.statusCode = 500;
		res.end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"setup",
				"--profile",
				"research",
				"--preset",
				"research",
				"--client",
				"installer-validation",
				"--install",
				"claude",
				"--no-open",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					AUTO_API_URL: `http://127.0.0.1:${port}`,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /Unsupported client\(s\): claude/);
		assert.equal(requests, 0);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup rejects a custom Read profile with only write-only categories before authorization", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-read-categories-"));
	let requests = 0;
	const server = http.createServer((_req, res) => {
		requests += 1;
		res.statusCode = 500;
		res.end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"setup",
				"--profile",
				"invalid-read",
				"--preset",
				"custom",
				"--access",
				"read",
				"--categories",
				"wallet-execution,spot",
				"--client",
				"category-validation",
				"--no-open",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					AUTO_API_URL: `http://127.0.0.1:${port}`,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /Read profile needs at least one read-capable category/i);
		assert.equal(requests, 0);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup rejects an empty verified tool catalog before persistence or acknowledgement", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-empty-catalog-"));
	let acknowledged = false;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(
				JSON.stringify({
					success: true,
					data: {
						deviceCode: "device-code-that-is-long-enough-for-validation",
						userCode: "ZERO-TOOL",
						verificationUri: "https://auto.test/settings/mcp-setup?user_code=ZERO-TOOL",
						expiresAt: Date.now() + 60_000,
						intervalSeconds: 0.001,
						profile: {
							id: "research",
							name: "Research",
							accessPreset: "read",
							surface: "research",
						},
					},
				}),
			);
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(
				JSON.stringify({
					success: true,
					data: {
						apiKey: "atk_empty_catalog_must_not_persist",
						profile: {
							id: "research",
							name: "Research",
							accessPreset: "read",
							surface: "research",
						},
					},
				}),
			);
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			acknowledged = true;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(
			process.execPath,
			[
				"dist/index.js",
				"setup",
				"--profile",
				"research",
				"--preset",
				"research",
				"--client",
				"catalog-check",
				"--no-open",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					AUTO_API_URL: `http://127.0.0.1:${port}`,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /did not expose any tools/);
		assert.equal(acknowledged, false);
		await assert.rejects(
			readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
			{ code: "ENOENT" },
		);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup rejects profile-verification redirects before forwarding the issued API key", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-redirect-"));
	let targetRequests = 0;
	let forwardedApiKey;
	let acknowledged = false;
	const target = http.createServer((req, res) => {
		targetRequests += 1;
		forwardedApiKey = req.headers["x-auto-api-key"];
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
	});
	target.listen(0, "127.0.0.1");
	await once(target, "listening");
	const targetPort = target.address().port;

	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "NO-RDRCT",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=NO-RDRCT",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_redirect_must_not_escape",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.statusCode = 307;
			res.setHeader("location", `http://127.0.0.1:${targetPort}/captured`);
			res.end();
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			acknowledged = true;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "redirect-check", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /redirect/i);
		assert.equal(targetRequests, 0);
		assert.equal(forwardedApiKey, undefined);
		assert.equal(acknowledged, false);
		await assert.rejects(
			readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
			{ code: "ENOENT" },
		);
	} finally {
		server.close();
		target.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup restores the previous active profile when acknowledgement fails", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-ack-rollback-"));
	const profilePath = path.join(home, ".auto", "mcp", "profiles.json");
	const previousProfiles = {
		version: 1,
		activeProfile: "working",
		profiles: {
			working: {
				apiKey: "atk_previous_working_key",
				apiUrl: "https://previous.auto.test",
				accessPreset: "read",
				surface: "research",
				categories: ["macro"],
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-02T00:00:00.000Z",
			},
		},
	};
	await mkdir(path.dirname(profilePath), { recursive: true });
	await writeFile(profilePath, `${JSON.stringify(previousProfiles, null, 2)}\n`, {
		mode: 0o600,
	});

	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "ROLL-BACK",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=ROLL-BACK",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_unacknowledged_key",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			res.statusCode = 409;
			res.end(JSON.stringify({ success: false, error: { message: "acknowledgement failed" } }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "replacement", "--preset", "research", "--client", "rollback-test", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /acknowledgement failed/i);
		assert.deepEqual(JSON.parse(await readFile(profilePath, "utf8")), previousProfiles);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup retries an ambiguous acknowledgement before completing setup", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-ack-retry-"));
	let acknowledgementAttempts = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "ACKR-ETRY",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=ACKR-ETRY",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_ack_retry_key",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			acknowledgementAttempts += 1;
			if (acknowledgementAttempts === 1) {
				req.socket.destroy();
				return;
			}
			res.end(JSON.stringify({ success: true, data: { status: "completed" } }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "ack-retry", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		assert.equal(acknowledgementAttempts, 2);
		const profiles = JSON.parse(await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"));
		assert.equal(profiles.activeProfile, "research");
		assert.equal(profiles.profiles.research.apiKey, "atk_ack_retry_key");
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup retries transient token exchange failures until the authorization succeeds", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-token-retry-"));
	let tokenAttempts = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "TOKN-RETY",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=TOKN-RETY",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			tokenAttempts += 1;
			if (tokenAttempts === 1) {
				req.socket.destroy();
				return;
			}
			if (tokenAttempts === 2) {
				res.statusCode = 503;
				res.end(JSON.stringify({
					success: false,
					error: { code: "SERVICE_UNAVAILABLE", message: "try again" },
				}));
				return;
			}
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_token_retry_key",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			res.end(JSON.stringify({ success: true, data: { status: "completed" } }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "token-retry", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 0, result.stderr);
		assert.equal(tokenAttempts, 3);
		const profiles = JSON.parse(await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"));
		assert.equal(profiles.profiles.research.apiKey, "atk_token_retry_key");
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup fails immediately when token exchange reports a terminal authorization error", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-token-terminal-"));
	let tokenAttempts = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "TOKN-DENY",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=TOKN-DENY",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			tokenAttempts += 1;
			res.statusCode = 403;
			res.end(JSON.stringify({
				success: false,
				error: { code: "AUTHORIZATION_DENIED", message: "Authorization was denied" },
			}));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "token-terminal", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /authorization was denied/i);
		assert.equal(tokenAttempts, 1);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup preserves the verified profile when acknowledgement succeeded but its response was lost", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-ack-lost-response-"));
	let acknowledgementAttempts = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "ACKL-OST1",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=ACKL-OST1",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_ack_lost_response_key",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			acknowledgementAttempts += 1;
			if (acknowledgementAttempts === 1) {
				req.socket.destroy();
				return;
			}
			res.statusCode = 409;
			res.end(JSON.stringify({
				success: false,
				error: {
					code: "AUTHORIZATION_ALREADY_COMPLETED",
					message: "Authorization is already completed",
				},
			}));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "ack-lost-response", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /completion is uncertain/i);
		assert.equal(acknowledgementAttempts, 2);
		const profiles = JSON.parse(await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"));
		assert.equal(profiles.activeProfile, "research");
		assert.equal(profiles.profiles.research.apiKey, "atk_ack_lost_response_key");
		assert.equal(profiles.pendingSetups, undefined);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup preserves the verified profile when acknowledgement completion stays uncertain", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-ack-uncertain-"));
	let acknowledgementAttempts = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "device-code-that-is-long-enough-for-validation",
				userCode: "ACKU-NCERT",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=ACKU-NCERT",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0.001,
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: {
				apiKey: "atk_ack_uncertain_key",
				profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" },
			} }));
			return;
		}
		if (req.method === "GET" && req.url === "/api/mcp/tools?surface=research") {
			res.end(JSON.stringify({ success: true, data: { tools: [{ write: false }] } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			acknowledgementAttempts += 1;
			res.statusCode = 503;
			res.end(JSON.stringify({ success: false, error: { message: "response unavailable" } }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();
	try {
		const result = await run(
			process.execPath,
			["dist/index.js", "setup", "--profile", "research", "--preset", "research", "--client", "ack-uncertain", "--no-open"],
			{
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /completion is uncertain/i);
		assert.equal(acknowledgementAttempts, 3);
		const profiles = JSON.parse(await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"));
		assert.equal(profiles.activeProfile, "research");
		assert.equal(profiles.profiles.research.apiKey, "atk_ack_uncertain_key");
		assert.equal(profiles.pendingSetups, undefined);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});
