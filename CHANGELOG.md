# Changelog

Semver: patch for docs and metadata, minor for new compatible behavior, major for breaking changes.

## Unreleased

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
