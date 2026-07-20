# Changelog

Semver: patch for docs and metadata, minor for new compatible behavior, major for breaking changes.

## Unreleased

- Split interactive authorization and client installation into the new
  `@atnms/auto-cli` package while keeping `@atnms/auto-mcp` a thin stdio proxy.
- Make every supported installer collision-safe, keep API keys out of client
  configuration, and synchronize profile-based setup instructions into plugins.

## 0.4.0

- Add interactive browser authorization with Research, Perps trading, Full
  trading, and Advanced custom profiles. Store credentials in owner-only named
  profiles instead of MCP client configurations.
- Add safe installers for Claude Code, Claude Desktop, Codex, Cursor, Windsurf,
  VS Code, and Gemini CLI, including print-only review, backups, and explicit
  replacement for existing direct JSON entries.
- Mark MCP tools with read/write safety annotations and document the distinction
  between enforced API access and visible tool surfaces or categories.

## 0.3.2

- Replace the research skill's temporary "Tool Substitutions" section with
  neutral "Tool Selection" guidance; regenerate rules bundles and plugin
  skill copies to match (verified against the production gateway 2026-07-08).
- Trim operational docs: billing guidance now points at pairing a dedicated
  web/X MCP for narrative data.

## 0.3.1

- Rename data categories to the gateway's neutral labels: `derivatives`,
  `trader-intel`, `onchain-analytics`, `market-prices`, `defi-analytics`,
  `token-data` (old strings keep working as input aliases). Updated billing
  docs, skill cards, and rules bundles to match.

## 0.3.0

- Add portable `rules/` — harness-neutral versions of the skill cards, generated
  from `skills/` by `scripts/build-rules.mjs`, with per-surface `AGENTS.<surface>.md`
  bundles for Codex, Cursor, Windsurf, Cline, and any rules-based harness.
- Add client config examples for Cursor, Windsurf, VS Code, and Gemini CLI, plus
  an `examples/README.md` client matrix.
- Fix stale default host in docs and skill cards (`develop.auto.fun` → `auto.fun`).
- Reframe `README.md` around universal install; Claude plugins are now one option.

## 0.2.1

- Add package `types` + `exports` map and `prepublishOnly` build guard.
- CI: auto-publish `@atnms/auto-mcp` to npm on push to `main` (version-guarded).

## 0.2.0

- Default host is now `https://auto.fun` (production). Override with `AUTO_API_URL`.
- Public MCP gateway is live on production: research/perps/trading surfaces,
  per-call x402 USDC billing on Base, scoped Read / Read+Write API keys.

## 0.1.1

- Fix `@atnms/auto-mcp` package metadata for MIT license and repository links.
- Document Claude setup, gateway env vars, billing receipts, limits, key-leak behavior, category strings, and venue boundaries.
- Change the default `AUTO_API_URL` host to `https://develop.auto.fun`.
- Correct Kalshi and Polymarket skill-card guidance.
- Note that the social category was removed server-side.

## 0.1.0

- Add Auto MCP Package placeholder `auto-mcp`.
- Add Claude plugin marketplace entries for research, perps, and trading.
- Add six public skill cards.
- Add quickstarts, billing/API-key docs, error docs, examples, and Agent Brain sample vault.
