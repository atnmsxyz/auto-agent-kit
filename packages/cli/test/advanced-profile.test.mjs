import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
		child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
		child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
		child.once("error", reject);
		child.once("exit", (code) => resolve({ code, stdout, stderr }));
	});
}

async function readBody(req) {
	let body = "";
	for await (const chunk of req) body += chunk.toString("utf8");
	return JSON.parse(body);
}

test("advanced setup keeps Read access separate from custom tool categories", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-advanced-"));
	const apiKey = "atk_advanced_profile_secret";
	let startRequest = null;
	let verificationUrl = null;
	let startAccess = "read";
	let tokenAccess = "read";
	let verificationRequests = 0;
	const server = http.createServer(async (req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/authorizations") {
			startRequest = await readBody(req);
			res.statusCode = 201;
			res.end(JSON.stringify({ success: true, data: {
				deviceCode: "advanced-device-code-that-is-long-enough",
				userCode: "WXYZ-2345",
				verificationUri: "https://auto.test/settings/mcp-setup?user_code=WXYZ-2345",
				expiresAt: Date.now() + 60_000,
				intervalSeconds: 0,
				profile: {
					id: "custom",
					name: "Custom tool set",
					accessPreset: startAccess,
					surface: "research",
					categories: ["market-prices", "macro"],
				},
			} }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/token") {
			res.end(JSON.stringify({ success: true, data: { apiKey, profile: {
				id: "custom",
				name: "Custom tool set",
				accessPreset: tokenAccess,
				surface: "research",
				categories: ["market-prices", "macro"],
			} } }));
			return;
		}
		if (req.method === "POST" && req.url === "/api/auth/mcp-setup/acknowledge") {
			res.end(JSON.stringify({ success: true, data: { status: "completed" } }));
			return;
		}
		if (req.method === "GET" && req.url?.startsWith("/api/mcp/tools?")) {
			verificationRequests += 1;
			verificationUrl = req.url;
			res.end(JSON.stringify({ success: true, data: { tools: [
				{ name: "GET_SIMPLE_PRICE", write: false },
				{ name: "FRED_GET_SERIES", write: false },
			] } }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ success: false, error: { message: "not found" } }));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address();

	try {
		const result = await run(process.execPath, [
			"dist/index.js", "setup",
			"--profile", "macro-research",
			"--preset", "custom",
			"--access", "read",
			"--categories", "market-prices,macro",
			"--client", "gemini",
			"--no-open",
		], {
			cwd: new URL("..", import.meta.url),
			env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
			stdio: ["ignore", "pipe", "pipe"],
		});
		assert.equal(result.code, 0, result.stderr);
		assert.deepEqual(startRequest, {
			profile: "custom",
			clientName: "gemini",
			accessPreset: "read",
			categories: ["market-prices", "macro"],
		});
		assert.equal(verificationUrl, "/api/mcp/tools?categories=market-prices%2Cmacro");
		assert.match(result.stdout, /Verified 2 tools \(0 write\)/);
		assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(apiKey));

		const stored = JSON.parse(
			await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
		).profiles["macro-research"];
		assert.equal(stored.accessPreset, "read");
			assert.equal(stored.surface, "research");
			assert.deepEqual(stored.categories, ["market-prices", "macro"]);

			startAccess = "read_write";
			tokenAccess = "read_write";
			const writeKeyWithReadTools = await run(process.execPath, [
				"dist/index.js", "setup",
				"--profile", "write-key-read-tools",
				"--preset", "custom",
				"--access", "read_write",
				"--categories", "market-prices,macro",
				"--client", "gemini",
				"--no-open",
			], {
				cwd: new URL("..", import.meta.url),
				env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
				stdio: ["ignore", "pipe", "pipe"],
			});
			assert.equal(writeKeyWithReadTools.code, 0, writeKeyWithReadTools.stderr);
			assert.match(writeKeyWithReadTools.stdout, /Verified 2 tools \(0 write\)/);
			const writeKeyProfile = JSON.parse(
				await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
			).profiles["write-key-read-tools"];
			assert.equal(writeKeyProfile.accessPreset, "read_write");
			assert.deepEqual(writeKeyProfile.categories, ["market-prices", "macro"]);

			startAccess = "read";
			const substituted = await run(process.execPath, [
			"dist/index.js", "setup",
			"--profile", "substituted",
			"--preset", "custom",
			"--access", "read",
			"--categories", "market-prices,macro",
			"--client", "gemini",
			"--no-open",
		], {
			cwd: new URL("..", import.meta.url),
			env: { ...process.env, HOME: home, AUTO_API_URL: `http://127.0.0.1:${port}` },
			stdio: ["ignore", "pipe", "pipe"],
		});
		assert.equal(substituted.code, 1);
		assert.match(substituted.stderr, /approved setup profile does not match/i);
			assert.equal(verificationRequests, 2);
		const afterSubstitution = JSON.parse(
			await readFile(path.join(home, ".auto", "mcp", "profiles.json"), "utf8"),
		);
		assert.equal(afterSubstitution.profiles.substituted, undefined);
	} finally {
		server.close();
		await rm(home, { recursive: true, force: true });
	}
});
