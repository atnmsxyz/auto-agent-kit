import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);

test("release gate waits for the CLI's exact MCP runtime version", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "auto-runtime-gate-"));
	const countFile = path.join(directory, "count");
	const argsFile = path.join(directory, "args");
	const npmPath = path.join(directory, "npm");
	await writeFile(
		npmPath,
		`#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const countFile = process.env.FAKE_NPM_COUNT_FILE;
const argsFile = process.env.FAKE_NPM_ARGS_FILE;
const count = existsSync(countFile) ? Number(readFileSync(countFile, "utf8")) + 1 : 1;
writeFileSync(countFile, String(count));
appendFileSync(argsFile, process.argv.slice(2).join(" ") + "\\n");
if (count < 3) process.exit(1);
process.stdout.write("0.4.0\\n");
`,
	);
	await chmod(npmPath, 0o755);

	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			["scripts/wait-for-mcp-runtime.mjs"],
			{
				cwd: root,
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					FAKE_NPM_COUNT_FILE: countFile,
					FAKE_NPM_ARGS_FILE: argsFile,
					AUTO_MCP_RUNTIME_ATTEMPTS: "3",
					AUTO_MCP_RUNTIME_RETRY_MS: "0",
				},
			},
		);
		assert.match(stdout, /@atnms\/auto-mcp@0\.4\.0 is published/);
		assert.equal(await readFile(countFile, "utf8"), "3");
		assert.equal(
			await readFile(argsFile, "utf8"),
			"view @atnms/auto-mcp@0.4.0 version\n".repeat(3),
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
