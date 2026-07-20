import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const execFileAsync = promisify(execFile);

async function contents(relativePath) {
	return await readFile(path.join(root, relativePath), "utf8");
}

test("published package docs keep setup in auto-cli and runtime in auto-mcp", async () => {
	const cliPackage = JSON.parse(await contents("packages/cli/package.json"));
	assert.equal(cliPackage.name, "@atnms/auto-cli");
	assert.deepEqual(cliPackage.bin, { auto: "./dist/index.js" });
	assert.equal(cliPackage.autoMcpRuntimeVersion, "0.4.0");

	const cliReadme = await contents("packages/cli/README.md");
	assert.match(cliReadme, /@atnms\/auto-cli@latest setup/);
	assert.match(cliReadme, /Read \+ Write/);
	assert.match(cliReadme, /--print-only/);
	assert.match(cliReadme, /--replace/);
	const mcpReadme = await contents("packages/mcp/README.md");
	assert.match(mcpReadme, /@atnms\/auto-cli@0\.1\.0 setup/);
	assert.match(mcpReadme, /@atnms\/auto-mcp@0\.4\.0/);

	for (const document of [
		"README.md",
		"docs/api-keys.md",
		"docs/quickstart-claude-code.md",
		"docs/quickstart-claude-desktop.md",
		"docs/quickstart-codex.md",
	]) {
		const markdown = await contents(document);
		assert.doesNotMatch(markdown, /@atnms\/auto-mcp(?:@latest)? setup/);
		assert.match(markdown, /@atnms\/auto-cli@latest setup/);
	}

	for (const example of [
		"examples/README.md",
		"examples/claude-code/mcp.json",
		"examples/claude-desktop/claude_desktop_config.json",
		"examples/codex/config.toml",
		"examples/cursor/mcp.json",
		"examples/gemini-cli/settings.json",
		"examples/hermes/README.md",
		"examples/vscode/mcp.json",
		"examples/windsurf/mcp_config.json",
	]) {
		const exampleContents = await contents(example);
		assert.doesNotMatch(exampleContents, /AUTO_API_KEY/);
		assert.match(exampleContents, /AUTO_MCP_PROFILE/);
	}
	const examplesReadme = await contents("examples/README.md");
	assert.match(
		examplesReadme,
		/@atnms\/auto-cli@latest setup --profile research --preset research/,
	);

	const releaseWorkflow = await contents(".github/workflows/release-cli.yml");
	assert.match(releaseWorkflow, /packages\/cli\/\*\*/);
	assert.match(releaseWorkflow, /working-directory: packages\/cli/);
	assert.match(releaseWorkflow, /npm publish --access public/);
	const runtimeGate = releaseWorkflow.indexOf(
		"node ../../scripts/wait-for-mcp-runtime.mjs",
	);
	assert.ok(runtimeGate >= 0);
	assert.ok(runtimeGate < releaseWorkflow.indexOf("npm publish --access public"));
});

test("the published MCP tarball contains only the thin runtime", async () => {
	const { stdout } = await execFileAsync(
		"npm",
		["pack", "--dry-run", "--json"],
		{ cwd: path.join(root, "packages", "mcp") },
	);
	const [{ files }] = JSON.parse(stdout);
	const packagedPaths = files.map((file) => file.path);
	assert.ok(packagedPaths.includes("dist/index.js"));
	assert.ok(packagedPaths.includes("dist/profiles.js"));
	assert.ok(!packagedPaths.some((file) => file.includes("installers")));
	assert.ok(!packagedPaths.some((file) => file.includes("setup")));
});
