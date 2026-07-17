#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPackage = JSON.parse(
	await readFile(path.join(root, "packages", "cli", "package.json"), "utf8"),
);
const runtimeVersion = cliPackage.autoMcpRuntimeVersion;
if (typeof runtimeVersion !== "string" || runtimeVersion.length === 0) {
	throw new Error("packages/cli/package.json must declare autoMcpRuntimeVersion");
}

const attempts = Number.parseInt(process.env.AUTO_MCP_RUNTIME_ATTEMPTS ?? "30", 10);
const retryMs = Number.parseInt(process.env.AUTO_MCP_RUNTIME_RETRY_MS ?? "10000", 10);
if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(retryMs) || retryMs < 0) {
	throw new Error("Runtime wait settings must be non-negative integers with at least one attempt");
}

const runtime = `@atnms/auto-mcp@${runtimeVersion}`;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
	try {
		await execFileAsync("npm", ["view", runtime, "version"]);
		process.stdout.write(`${runtime} is published\n`);
		process.exit(0);
	} catch (error) {
		if (attempt === attempts) throw error;
		process.stdout.write(
			`${runtime} is not visible yet; retrying (${attempt}/${attempts})\n`,
		);
		await new Promise((resolve) => setTimeout(resolve, retryMs));
	}
}
