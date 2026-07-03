import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
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

test("lists tools through stdio against an HTTP gateway stub", async () => {
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

	const child = spawn(process.execPath, ["dist/index.js"], {
		cwd: new URL("..", import.meta.url),
		env: {
			...process.env,
			AUTO_API_KEY: "atk_stubbed",
			AUTO_API_URL: `http://127.0.0.1:${port}`,
			AUTO_MCP_SURFACE: "research",
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

		writeJson(child, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		});
		const listed = await waitForJsonLine(child, 2);

		assert.equal(seenRequest.apiKey, "atk_stubbed");
		assert.equal(seenRequest.url, "/api/mcp/tools?surface=research");
		assert.deepEqual(listed.result.tools, [
			{
				name: "COINGLASS_GET_FUNDING",
				description: "[coinglass] Funding rates",
				inputSchema: { type: "object", properties: {} },
			},
		]);
	} finally {
		child.kill("SIGTERM");
		server.close();
	}
});
