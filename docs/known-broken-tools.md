# Known broken / avoid-these tools

Last verified: 2026-07-07 (against the develop gateway; production may lag behind fixes).

Agent-side knowledge the tool list does not surface: which advertised tools are dead or misleading, and which working sibling to use instead. **Maintenance rule: prune an entry when its paired `AUTO-*` fix ships to the gateway you run against.** Entries marked *fixed, pending rollout* already have the fix merged in `atnmsxyz/auto`; verify once before relying on them.

| Avoid | Why | Prefer instead | Status |
|---|---|---|---|
| `GET_TECHNICAL_INDICATORS` | failed validation on every input (AUTO-TA-1) | `GET_ADVANCED_INDICATORS` (same schema, works) | removed from catalog; entry stays until prod rollout |
| `WALLET_PNL_SUMMARY` / `WALLET_PORTFOLIO_HISTORY` | spot value dropped (~4x understatement) (AUTO-WALLET-2) | `USER_WALLET_INFO` for spot balances | fixed, pending rollout |
| `WEB_SEARCH` | upstream vendor account disabled — down on every call (AUTO-RESEARCH-1) | pair a dedicated web/X MCP | vendor/ops issue, still down |
| `CHECK_TX_CONFIRMATION` | serialization crash on every valid tx (AUTO-WALLET-1) | explorer link / `USER_TRANSACTION_HISTORY` data field | fixed, pending rollout |
| `HYPERLIQUID_GET_RECENT_TRADES` | trade-id validation crash on every market (AUTO-PERPS-1) | `HYPERLIQUID_GET_CANDLES` for tape context | fixed, pending rollout |
| `HYPERLIQUID_GET_POINTS_STATUS` | 501 on every call (AUTO-PERPS-2) | none — skip | fixed, pending rollout |
| `ONCHAIN_SCORE_TOP_TOKENS` | 404 on every input (AUTO-ONCHAIN-1) | `ONCHAIN_GROWTH_CHAIN_RANK` or other onchain rankers | hidden from catalog, pending rollout |
| `GET_POLYMARKET_TRADER_LEADERBOARD` | upstream endpoint moved — 404 every call (AUTO-PMR-1) | — | fixed (versioned endpoint), pending rollout |
| `GET_TOP_PREDICTION_TRADERS` | dataset unlicensed — "upgrade your plan" every call (AUTO-TOKEN-1) | none | hidden from catalog, pending rollout |
| `GET_POLYMARKET_BALANCE` | read the CLOB portfolio of the wrong wallet → $0 for funded accounts (AUTO-PMTRADE-6) | `USER_WALLET_INFO` → "Polymarket (funded for trading)" | fixed, pending rollout |

Charged-but-wrong (don't trust, still billed — cross-read a sibling):

| Tool | Problem | Cross-read | Status |
|---|---|---|---|
| `GET_POLYMARKET_SIGNALS` | hardcoded 0.5 price → wrong recommendation (AUTO-PMR-3) | `GET_POLYMARKET_PRICE` / market detail | fixed, pending rollout |
| `GET_POLYMARKET_MARKET_OPEN_INTEREST` | global OI mislabeled as per-market on bogus ids (AUTO-PMR-4) | `GET_POLYMARKET_DETAIL` | fixed, pending rollout |

Billing hygiene for tools that charge on empty/invalid results: see [billing.md](billing.md).
