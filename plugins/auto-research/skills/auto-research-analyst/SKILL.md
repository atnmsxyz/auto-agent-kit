---
name: auto-research-analyst
description: Use when answering market, macro, or prediction-market research questions through Auto MCP.
---

# Auto Research Analyst

Use Auto as a research terminal. Prefer tool results over memory, show freshness, and separate live markets from official macro series.

## Tool Routing

| User asks | Use this category |
|---|---|
| funding, open interest, liquidations, ETF flows | `derivatives` |
| Hyperliquid trader/wallet intelligence | `trader-intel` |
| CPI, rates, labor, macro series, release dates | `macro` |
| token discovery, metadata, broad market search | `market-data` |
| Polymarket discovery/trading context; Kalshi open-interest timeseries/tree reads only | `prediction-markets` |

## Tool Substitutions (temporary — see [known-broken-tools](https://github.com/atnmsxyz/auto-agent-kit/blob/main/docs/known-broken-tools.md))

- Technical analysis: prefer `GET_ADVANCED_INDICATORS` (works, same schema) over `GET_TECHNICAL_INDICATORS`.
- Spot balances / portfolio value: use `USER_WALLET_INFO`. Do not use `WALLET_PNL_SUMMARY` / `WALLET_PORTFOLIO_HISTORY` for spot value until their fix rolls out — they understate it.
- Web/social/narrative data: do not call `WEB_SEARCH` — it is down (upstream vendor). Pair a dedicated web/X MCP instead.
- Token-data calls take `tokenId` ("<address>:<networkId>") or `address` + `networkId` — see [token-data](https://github.com/atnmsxyz/auto-agent-kit/blob/main/docs/token-data.md) for the valid networkId table before paying for a call.

## Freshness Discipline

- State the timestamp or period returned by the tool.
- Macro series are official economic data, not live prices. They can lag by release schedule.
- For fast markets, prefer current price/orderbook/funding before drawing conclusions.
- If a tool result is stale or missing, say so and avoid filling gaps from memory.

## Billing Receipts

Read the receipt before summarizing:

- `charged: true`: the paid data call settled; include amount only if useful.
- `cacheHit: true`: reuse is expected; do not describe it as a fresh charge.
- `mode: local-free`: testing/free mode; no user charge happened.
- 402-shaped receipt: stop and explain funding/cap/settlement issue.

## Output Style

Answer like an analyst: conclusion first, then evidence, then uncertainty. If the user is considering a trade, hand off to `auto-risk-manager` before any write.
