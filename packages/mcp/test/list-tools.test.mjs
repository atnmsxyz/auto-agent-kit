import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

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
		proc.once("exit", (code) => reject(new Error(`child exited ${code}`)));
	});
}

test("rejects a missing --profile value instead of falling back", async () => {
	const child = spawn(process.execPath, ["dist/index.js", "--profile"], {
		cwd: new URL("..", import.meta.url),
		env: { ...process.env, AUTO_API_KEY: "atk_must_not_fallback" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderr = "";
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString("utf8");
	});
	const outcome = await Promise.race([
		once(child, "exit").then(([code]) => ({ exited: true, code })),
		new Promise((resolve) =>
			setTimeout(() => resolve({ exited: false, code: null }), 2_000),
		),
	]);
	if (!outcome.exited) child.kill("SIGTERM");
	assert.equal(outcome.exited, true);
	assert.equal(outcome.code, 1);
	assert.match(stderr, /--profile requires a value/i);
});

test("lists tools through stdio with stored visibility when an environment key overrides the credential", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-profile-"));
	await mkdir(path.join(home, ".auto", "mcp"), { recursive: true });
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json"),
		JSON.stringify({
			version: 1,
			activeProfile: "custom",
			profiles: {
				custom: {
					apiKey: "atk_stored",
					apiUrl: "https://ignored.example",
					accessPreset: "read",
					surface: "research",
					categories: ["macro"],
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		}),
	);
	let seenRequest = null;
	const server = http.createServer((req, res) => {
		seenRequest = {
			url: req.url,
			apiKey: req.headers["x-auto-api-key"],
		};
		res.setHeader("content-type", "application/json");
		res.end(
			JSON.stringify({
				success: true,
				data: {
					tools: [
						{
							name: "COINGLASS_GET_FUNDING",
							description: "Funding rates",
							inputSchema: { type: "object", properties: {} },
							write: false,
							categories: ["coinglass"],
						},
					],
				},
			}),
		);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	const child = spawn(process.execPath, ["dist/index.js", "--profile", "custom"], {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			HOME: home,
			AUTO_API_KEY: "atk_inherited",
			AUTO_API_URL: `http://127.0.0.1:${port}`,
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
		const initialized = await waitForJsonLine(child, 1);
		assert.equal(initialized.result.serverInfo.name, "auto-mcp");
		assert.match(initialized.result.instructions, /API key access is enforced by Auto/i);
		assert.match(initialized.result.instructions, /confirm write tool calls/i);

		writeJson(child, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		});
		const listed = await waitForJsonLine(child, 2);

		assert.equal(seenRequest.apiKey, "atk_inherited");
		assert.equal(seenRequest.url, "/api/mcp/tools?categories=macro");
		assert.deepEqual(listed.result.tools, [
			{
				name: "COINGLASS_GET_FUNDING",
				description: "[coinglass] Funding rates",
				inputSchema: { type: "object", properties: {} },
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: false,
					openWorldHint: true,
				},
			},
		]);
	} finally {
		child.kill("SIGTERM");
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("keeps a stored credential bound to its saved API origin", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-origin-"));
	await mkdir(path.join(home, ".auto", "mcp"), { recursive: true });
	let storedOriginRequests = 0;
	let overrideOriginRequests = 0;
	const storedOrigin = http.createServer((_req, res) => {
		storedOriginRequests += 1;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ success: true, data: { tools: [] } }));
	});
	const overrideOrigin = http.createServer((_req, res) => {
		overrideOriginRequests += 1;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ success: true, data: { tools: [] } }));
	});
	storedOrigin.listen(0, "127.0.0.1");
	overrideOrigin.listen(0, "127.0.0.1");
	await Promise.all([once(storedOrigin, "listening"), once(overrideOrigin, "listening")]);
	const storedUrl = `http://127.0.0.1:${storedOrigin.address().port}`;
	const overrideUrl = `http://127.0.0.1:${overrideOrigin.address().port}`;
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json"),
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_stored_origin_key",
					apiUrl: storedUrl,
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		}),
	);
	const child = spawn(process.execPath, ["dist/index.js", "--profile", "research"], {
		cwd: new URL("..", import.meta.url),
		env: { ...process.env, HOME: home, AUTO_API_KEY: "", AUTO_API_URL: overrideUrl },
		stdio: ["pipe", "pipe", "pipe"],
	});
	try {
		writeJson(child, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "node-test", version: "0.0.0" } },
		});
		await waitForJsonLine(child, 1);
		writeJson(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
		await waitForJsonLine(child, 2);
		assert.equal(storedOriginRequests, 1);
		assert.equal(overrideOriginRequests, 0);
	} finally {
		child.kill("SIGTERM");
		storedOrigin.close();
		overrideOrigin.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("does not send an environment credential to a stored profile origin", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-env-origin-"));
	await mkdir(path.join(home, ".auto", "mcp"), { recursive: true });
	let storedOriginRequests = 0;
	const storedOrigin = http.createServer((_req, res) => {
		storedOriginRequests += 1;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ success: true, data: { tools: [] } }));
	});
	storedOrigin.listen(0, "127.0.0.1");
	await once(storedOrigin, "listening");
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json"),
		JSON.stringify({
			version: 1,
			activeProfile: "staging",
			profiles: {
				staging: {
					apiKey: "atk_stored_staging_key",
					apiUrl: `http://127.0.0.1:${storedOrigin.address().port}`,
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		}),
	);
	const child = spawn(process.execPath, ["dist/index.js", "--profile", "staging"], {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			HOME: home,
			AUTO_API_KEY: "atk_environment_key",
			AUTO_API_URL: "",
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
	try {
		writeJson(child, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "node-test", version: "0.0.0" } },
		});
		await waitForJsonLine(child, 1);
		writeJson(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.equal(storedOriginRequests, 0);
	} finally {
		child.kill("SIGTERM");
		storedOrigin.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("does not forward a profile credential across gateway redirects", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-redirect-origin-"));
	await mkdir(path.join(home, ".auto", "mcp"), { recursive: true });
	let redirectedRequests = 0;
	let redirectedApiKey;
	const redirectTarget = http.createServer((req, res) => {
		redirectedRequests += 1;
		redirectedApiKey = req.headers["x-auto-api-key"];
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify({ success: true, data: { tools: [] } }));
	});
	redirectTarget.listen(0, "127.0.0.1");
	await once(redirectTarget, "listening");
	const configuredOrigin = http.createServer((req, res) => {
		res.statusCode = 302;
		res.setHeader(
			"location",
			`http://127.0.0.1:${redirectTarget.address().port}${req.url}`,
		);
		res.end();
	});
	configuredOrigin.listen(0, "127.0.0.1");
	await once(configuredOrigin, "listening");
	await writeFile(
		path.join(home, ".auto", "mcp", "profiles.json"),
		JSON.stringify({
			version: 1,
			activeProfile: "research",
			profiles: {
				research: {
					apiKey: "atk_redirect_must_not_escape",
					apiUrl: `http://127.0.0.1:${configuredOrigin.address().port}`,
					accessPreset: "read",
					surface: "research",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		}),
	);
	const child = spawn(process.execPath, ["dist/index.js", "--profile", "research"], {
		cwd: new URL("..", import.meta.url),
		env: { ...process.env, HOME: home, AUTO_API_KEY: "" },
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

		assert.ok(listed.error);
		assert.equal(redirectedRequests, 0);
		assert.equal(redirectedApiKey, undefined);
	} finally {
		child.kill("SIGTERM");
		configuredOrigin.close();
		redirectTarget.close();
		await rm(home, { recursive: true, force: true });
	}
});
