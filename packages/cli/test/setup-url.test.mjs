import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { externalUrlCommand } from "../dist/setup.js";

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
		child.once("exit", (code) => resolve({ code, stdout, stderr }));
	});
}

test("Windows browser handoff keeps the verification URL out of the command shell", () => {
	const url = "https://auto.test/settings/mcp-setup?user_code=ABCD-EFGH&next=done";
	assert.deepEqual(externalUrlCommand(url, "win32"), {
		file: "explorer.exe",
		args: [url],
	});
});

test("setup treats a blank API URL as the production origin", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auto-mcp-blank-api-url-"));
	const requestLog = path.join(home, "requests.log");
	const fetchHook = path.join(home, "fetch-hook.mjs");
	await writeFile(
		fetchHook,
		`import { appendFileSync } from "node:fs";
globalThis.fetch = async (input) => {
  const url = String(input);
  appendFileSync(process.env.AUTO_MCP_REQUEST_LOG, url + "\\n");
  const response = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
  if (url.endsWith("/api/auth/mcp-setup/authorizations")) return response({
    deviceCode: "device-code-that-is-long-enough-for-validation",
    userCode: "ABCD-EFGH",
    verificationUri: "https://auto.fun/settings/mcp-setup?user_code=ABCD-EFGH",
    expiresAt: Date.now() + 60000,
    intervalSeconds: 0,
    profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" }
  }, 201);
  if (url.endsWith("/api/auth/mcp-setup/token")) return response({
    apiKey: "atk_blank_origin_key",
    profile: { id: "research", name: "Research", accessPreset: "read", surface: "research" }
  });
  if (url.endsWith("/api/mcp/tools?surface=research")) return response({ tools: [{ name: "MARKET_PRICE", description: "Read price", inputSchema: { type: "object" }, write: false }] });
  if (url.endsWith("/api/auth/mcp-setup/acknowledge")) return response({ status: "completed" });
  return new Response(JSON.stringify({ success: false }), { status: 404 });
};
`,
		"utf8",
	);

	try {
		const setup = await run(
			process.execPath,
			[
				"dist/index.js",
				"setup",
				"--profile",
				"research",
				"--preset",
				"research",
				"--client",
				"test",
			],
			{
				cwd: new URL("..", import.meta.url),
				env: {
					...process.env,
					HOME: home,
					PATH: "",
					AUTO_API_URL: "   ",
					AUTO_MCP_REQUEST_LOG: requestLog,
					NODE_OPTIONS: `--import=${fetchHook}`,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		assert.equal(setup.code, 0, setup.stderr);
		const requests = (await readFile(requestLog, "utf8")).trim().split("\n");
		assert.equal(
			requests[0],
			"https://auto.fun/api/auth/mcp-setup/authorizations",
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
