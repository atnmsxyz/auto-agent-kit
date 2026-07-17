import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);

test("build-rules synchronizes profile-based MCP setup into every plugin bundle", async () => {
	await execFileAsync(process.execPath, ["scripts/build-rules.mjs"], { cwd: root });
	const canonical = await readFile(
		path.join(root, "skills", "connect-auto-mcp", "SKILL.md"),
		"utf8",
	);
	assert.match(canonical, /@atnms\/auto-cli@latest setup/);
	assert.match(canonical, /@atnms\/auto-mcp@latest/);
	assert.match(canonical, /real interactive terminal/i);
	assert.match(canonical, /do not execute .* non-TTY agent shell/i);

	for (const [plugin, surface] of [
		["auto-research", "research"],
		["auto-perps", "perps"],
		["auto-trading", "trading"],
	]) {
		const pluginRoot = path.join(root, "plugins", plugin);
		const manifest = JSON.parse(
			await readFile(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"),
		);
		assert.equal(manifest.version, "0.2.0");
		const pluginSkill = await readFile(
			path.join(pluginRoot, "skills", "connect-auto-mcp", "SKILL.md"),
			"utf8",
		);
		assert.match(
			pluginSkill,
			new RegExp(
				`@atnms/auto-cli@latest setup --profile ${surface} --preset ${surface}`,
			),
		);
		assert.match(pluginSkill, /real interactive terminal/i);
		assert.match(pluginSkill, /do not execute .* non-TTY agent shell/i);
		const config = JSON.parse(
			await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"),
		);
		assert.deepEqual(config.mcpServers.auto, {
			command: "npx",
			args: ["-y", "@atnms/auto-mcp@latest"],
			env: {
				AUTO_MCP_PROFILE: surface,
				AUTO_MCP_SURFACE: surface,
			},
		});
		assert.doesNotMatch(JSON.stringify(config), /AUTO_API_KEY/);
	}
});
