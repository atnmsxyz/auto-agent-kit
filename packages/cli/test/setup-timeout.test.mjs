import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
import { test } from "node:test";

const packageRoot = new URL("..", import.meta.url);

async function runSetupWithDeadline(apiUrl, home, requestTimeoutMs = 50) {
	const child = spawn(
		process.execPath,
		[
			"dist/index.js",
			"setup",
			"--profile",
			"research",
			"--preset",
			"research",
			"--client",
			"timeout-test",
			"--no-open",
		],
		{
			cwd: packageRoot,
			env: {
				...process.env,
				HOME: home,
				AUTO_API_URL: apiUrl,
				AUTO_MCP_SETUP_REQUEST_TIMEOUT_MS: String(requestTimeoutMs),
			},
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
	const watchdog = setTimeout(() => child.kill("SIGTERM"), 1_500);
	const [code, signal] = await once(child, "close");
	clearTimeout(watchdog);
	return { code, signal, stdout, stderr };
}

async function listen(server) {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return `http://127.0.0.1:${server.address().port}`;
}

test("setup aborts stalled authorization and profile-verification requests", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-timeout-"));
	const stalledAuthorization = http.createServer(() => {});
	const authorizationUrl = await listen(stalledAuthorization);

	try {
		const authorization = await runSetupWithDeadline(authorizationUrl, home);
		assert.equal(authorization.code, 1, authorization.stderr);
		assert.equal(authorization.signal, null);
		assert.match(authorization.stderr, /timed out after 50ms/i);
	} finally {
		stalledAuthorization.closeAllConnections();
		stalledAuthorization.close();
	}

	const stalledVerification = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(JSON.stringify({
				success: true,
				data: {
					deviceCode: "timeout-device-code-that-is-long-enough",
					userCode: "TIME-OUT1",
					verificationUri: "https://auto.test/settings/mcp-setup?user_code=TIME-OUT1",
					expiresAt: Date.now() + 60_000,
					intervalSeconds: 0.001,
					profile: {
						id: "research",
						name: "Research",
						accessPreset: "read",
						surface: "research",
					},
				},
			}));
			return;
		}
		if (req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({
				success: true,
				data: {
					apiKey: "atk_timeout_secret",
					profile: {
						id: "research",
						name: "Research",
						accessPreset: "read",
						surface: "research",
					},
				},
			}));
		}
	});
	const verificationUrl = await listen(stalledVerification);

	try {
		const verification = await runSetupWithDeadline(verificationUrl, home);
		assert.equal(verification.code, 1, verification.stderr);
		assert.equal(verification.signal, null);
		assert.match(verification.stderr, /timed out after 50ms/i);
	} finally {
		stalledVerification.closeAllConnections();
		stalledVerification.close();
		await rm(home, { recursive: true, force: true });
	}
});

test("setup rejects invalid authorization timing before polling", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-invalid-timing-"));
	let tokenRequests = 0;
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.url === "/api/auth/mcp-setup/authorizations") {
			res.statusCode = 201;
			res.end(
				JSON.stringify({
					success: true,
					data: {
						deviceCode: "invalid-timing-device-code-that-is-long-enough",
						userCode: "TIME-BAD1",
						verificationUri:
							"https://auto.test/settings/mcp-setup?user_code=TIME-BAD1",
						expiresAt: Date.now() + 60_000,
						intervalSeconds: 0,
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
		if (req.url === "/api/auth/mcp-setup/token") tokenRequests += 1;
		res.end(JSON.stringify({ success: false, error: { message: "unexpected" } }));
	});
	const apiUrl = await listen(server);

	try {
		const result = await runSetupWithDeadline(apiUrl, home, 1_000);
		assert.equal(result.code, 1, result.stderr);
		assert.equal(result.signal, null);
		assert.match(result.stderr, /invalid authorization timing/i);
		assert.equal(tokenRequests, 0);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});
