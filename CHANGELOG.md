# Changelog

Semver: patch for docs and metadata, minor for new compatible behavior, major for breaking changes.

## 0.2.0

- Default host is now `https://auto.fun` (production). Override with `AUTO_API_URL`.
- Public MCP gateway is live on production: research/perps/trading surfaces,
  per-call x402 USDC billing on Base, scoped Read / Read+Write API keys.

## Unreleased

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
