#!/usr/bin/env node
// Generate harness-neutral rule files from the Claude skill cards in skills/.
//
// skills/<name>/SKILL.md is the single source of truth. This script strips the
// Claude-specific YAML frontmatter and writes plain-markdown rules that ANY
// harness (Codex, Cursor, Windsurf, Cline/VS Code, Gemini CLI, or a raw system
// prompt) can load:
//
//   rules/<name>.md            one portable rule per skill
//   rules/AGENTS.<surface>.md  a ready-to-paste bundle per MCP surface
//   rules/README.md            how to use these in any harness
//   plugins/auto-*/            synchronized connect skill and profile-based MCP config
//
// Run: node scripts/build-rules.mjs   (no dependencies)

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");
const outDir = join(root, "rules");

// Which skills each MCP surface should load, mirroring the plugins.
const SURFACES = {
	research: ["connect-auto-mcp", "auto-research-analyst", "auto-trading-brain"],
	perps: [
		"connect-auto-mcp",
		"auto-research-analyst",
		"auto-perps-trader",
		"auto-fund-venues",
		"auto-risk-manager",
		"auto-trading-brain",
	],
	trading: [
		"connect-auto-mcp",
		"auto-research-analyst",
		"auto-perps-trader",
		"auto-prediction-markets",
		"auto-fund-venues",
		"auto-risk-manager",
		"auto-trading-brain",
	],
};

const PLUGIN_BY_SURFACE = {
	research: "auto-research",
	perps: "auto-perps",
	trading: "auto-trading",
};

/** Split `---\n...\n---\nbody` into { meta, body }. */
function parseSkill(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!m) return { meta: {}, body: text.trim() };
	const meta = {};
	for (const line of m[1].split("\n")) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv) meta[kv[1]] = kv[2].trim();
	}
	return { meta, body: m[2].trim() };
}

const skills = {};
for (const name of readdirSync(skillsDir)) {
	try {
		const raw = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
		skills[name] = { ...parseSkill(raw), raw };
	} catch {
		/* not a skill dir */
	}
}

mkdirSync(outDir, { recursive: true });

const BANNER = "<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->";

// One portable rule per skill.
for (const [name, { body }] of Object.entries(skills)) {
	writeFileSync(join(outDir, `${name}.md`), `${BANNER}\n\n${body}\n`);
}

// Per-surface bundles.
for (const [surface, names] of Object.entries(SURFACES)) {
	const parts = names.filter((n) => skills[n]).map((n) => skills[n].body);
	const header = [
		BANNER,
		"",
		`# Auto Agent Rules — \`${surface}\` surface`,
		"",
		"Operating rules for an agent using Auto MCP with " +
			`\`AUTO_MCP_SURFACE=${surface}\`. Paste this file into your harness's rules/system prompt`,
		"(Codex/Cursor `AGENTS.md`, Windsurf `.windsurfrules`, a Cursor rule, or a system prompt).",
		"",
	].join("\n");
	writeFileSync(
		join(outDir, `AGENTS.${surface}.md`),
		`${header}\n${parts.join("\n\n---\n\n")}\n`,
	);
}

// Index.
const readme = `# Auto Agent Rules (portable)

${BANNER}

These are harness-neutral versions of the Claude skill cards in \`skills/\`. Any
agent that reads markdown rules can use them — no Claude required.

## Per-surface bundles

Pick the file that matches your \`AUTO_MCP_SURFACE\` and load it into your harness:

| Surface | Bundle |
|---|---|
| \`research\` | [AGENTS.research.md](AGENTS.research.md) |
| \`perps\` | [AGENTS.perps.md](AGENTS.perps.md) |
| \`trading\` | [AGENTS.trading.md](AGENTS.trading.md) |

Where to put it:

- **Codex** — append to \`AGENTS.md\` in your project.
- **Cursor** — save as a \`.cursor/rules/auto.mdc\` rule (or \`.cursorrules\`).
- **Windsurf** — append to \`.windsurfrules\`.
- **Cline / Continue / VS Code** — add to the assistant's custom instructions.
- **Any other harness** — paste into the system prompt or rules file.

## Individual rules

${Object.keys(skills)
	.sort()
	.map((n) => `- [${n}.md](${n}.md)`)
	.join("\n")}

Regenerate after editing \`skills/\`: \`node scripts/build-rules.mjs\`
`;
writeFileSync(join(outDir, "README.md"), readme);

const connectSkill = skills["connect-auto-mcp"]?.raw;
if (!connectSkill) throw new Error("Missing canonical connect-auto-mcp skill");
for (const [surface, plugin] of Object.entries(PLUGIN_BY_SURFACE)) {
	const pluginRoot = join(root, "plugins", plugin);
	const pluginSkillDir = join(pluginRoot, "skills", "connect-auto-mcp");
	const pluginSkill = connectSkill.replace(
		"@atnms/auto-cli@0.1.0 setup",
		`@atnms/auto-cli@0.1.0 setup --profile ${surface} --preset ${surface}`,
	);
	mkdirSync(pluginSkillDir, { recursive: true });
	writeFileSync(join(pluginSkillDir, "SKILL.md"), pluginSkill);
	writeFileSync(
		join(pluginRoot, ".mcp.json"),
		`${JSON.stringify(
			{
				mcpServers: {
					auto: {
						command: "npx",
						args: ["-y", "@atnms/auto-mcp@0.4.0"],
							env: {
								AUTO_MCP_PROFILE: surface,
								AUTO_MCP_SURFACE: surface,
							},
					},
				},
			},
			null,
			2,
		)}\n`,
	);
}

console.log(
	`Generated ${Object.keys(skills).length} rules + ${Object.keys(SURFACES).length} surface bundles and synchronized ${Object.keys(PLUGIN_BY_SURFACE).length} plugins`,
);
