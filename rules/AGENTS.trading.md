<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->

# Auto Agent Rules — `trading` surface

Operating rules for an agent using Auto MCP with `AUTO_MCP_SURFACE=trading`. Paste this file into your harness's rules/system prompt
(Codex/Cursor `AGENTS.md`, Windsurf `.windsurfrules`, a Cursor rule, or a system prompt).

# Connect Auto MCP

Use this card when someone wants Auto tools inside an external agent. Keep the setup simple: install the MCP package, paste an Auto API key, choose one surface, then validate.

## Install

Configure the MCP client to run:

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

`AUTO_API_URL` defaults to `https://auto.fun` (production). Set it only for staging or local testing.

## Surface Picker

| Surface | Use when | Tools exposed |
|---|---|---|
| `research` | analysis, market context, macro, prediction-market discovery | read tools only |
| `perps` | Hyperliquid perps agent with research and wallet reads/bridging | research + perps order management + venue funding |
| `trading` | full external trading agent | perps, prediction markets, wallet execution, risk reads |

`AUTO_MCP_CATEGORIES` exists for power users. Prefer `AUTO_MCP_SURFACE`.

## Key Flow

1. Open the profile menu -> Account modal -> Account tab -> API Keys section.
2. Create **Read** for research-only agents or **Read + Write** for agents allowed to trade.
3. Paste the one-time `atk_...` key into the MCP client config.
4. Read the consent copy: paid data tools charge small USDC amounts from the Auto wallet; Read + Write can place trades, no withdrawals.
5. Fund the Auto wallet with USDC on Base before using paid reads in x402 mode.

## Validation Sequence

1. Restart the MCP client.
2. Ask it to list Auto tools.
3. Call a harmless read such as wallet, market, or macro data.
4. For Read keys, confirm write tools are absent or return 403.
5. For Read + Write keys, run `auto-risk-manager` before any write.

## Troubleshooting

- 401: key missing, revoked, expired, or not pasted into the MCP process env.
- 403: the key cannot access that tool or surface.
- 402-shaped receipt: paid read was over cap, lacked USDC, or settlement failed. Fund USDC on Base.
- 429: too many auth failures or requests; wait a minute and retry.

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

## Tool Substitutions (temporary — see docs/known-broken-tools.md)

- Technical analysis: prefer `GET_ADVANCED_INDICATORS` (works, same schema) over `GET_TECHNICAL_INDICATORS`.
- Spot balances / portfolio value: prefer `USER_WALLET_INFO` over `WALLET_PNL_SUMMARY` / `WALLET_PORTFOLIO_HISTORY` if their spot numbers look understated.
- Web/social/narrative data: `WEB_SEARCH` may be unavailable (upstream vendor) — pair a dedicated web/X MCP instead of retrying.
- Token-data calls take `tokenId` ("<address>:<networkId>") or `address` + `networkId` — see docs/token-data.md for the valid networkId table before paying for a call.

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

---

# Auto Perps Trader

Use for Hyperliquid perpetual futures. Funding the account IS available over MCP — bridge USDC to `hypercore` per `auto-fund-venues`. Withdrawals, transfers, staking, and treasury moves are not available over MCP; send the user to the Auto app for those.

## Preflight Before Writes

Run `auto-risk-manager`, then read: balance, current positions, open orders, existing TP/SL, current price, orderbook/liquidity, and live max leverage.

## Sizing

- Minimum order notional is $10. Compute `base size * mark price >= 10`.
- Limit orders far below/above mark: size is derived from mark, so notional at the LIMIT price can fall under $10 and reject. Increase size until `base size * limit price >= 10`.
- If margin cannot support a $10 notional at requested leverage, stop and ask the user to fund or resize.
- `sizeType=notional`: `size` is total position value.
- `sizeType=base`: `size` is asset quantity.
- `sizeType=collateral`: `size` is margin. "$50 at 3x" means collateral $50, notional $150.
- `sizeType=percentage`: `size` is percent of available margin.
- Echo collateral, notional, leverage, and approximate base size.

## Market Resolution

- For BTC/ETH/SOL-style core markets, price lookup can confirm the symbol.
- Builder-DEX assets such as stocks, commodities, and RWA require `SEARCH_MARKETS` first.
- Qualified symbols like `xyz:GOLD` must be passed exactly. Do not trade a bare commodity ticker if multiple venues appear.
- Read live max leverage. Never quote leverage caps from memory.

## Funding and Crowding

- Funding is usually hourly. Annualized funding = `rate * (8760 / intervalHours)`.
- Positive funding means longs pay shorts; negative means shorts pay longs.
- Above 0.01% per hour is crowded; above 0.03% per hour is extreme.

## TP/SL and Position Management

- Existing position TP/SL changes use modify/set-position protection, not a new entry.
- `tp` and `sl` params on a place-order call attach only to a new entry.
- Stop losses should sit before liquidation, not at liquidation.
- Warn if liquidation distance is under 15%; treat under 30% as elevated.
- Minimum sanity target: 2:1 reward/risk unless the user explicitly overrides after seeing the risk.

## TWAP

- Minimum $50 total and at least $10 per minute.
- Max practical duration in minutes is `floor(notionalUsd / 10)`.
- For TWAP, place the TWAP only. Do not also place a market order.

## Known Tool Caveats (temporary — prune each bullet when its `AUTO-PERPS-*` fix ships)

- `HYPERLIQUID_GET_RECENT_TRADES` crashed on every call (trade-id validation, AUTO-PERPS-1) — fix shipped in `atnmsxyz/auto`; if it still errors on your gateway, use `HYPERLIQUID_GET_CANDLES` for tape context.
- `HYPERLIQUID_GET_POINTS_STATUS` returned 501 on every call (AUTO-PERPS-2) — fix shipped; skip it if it still errors.
- `HYPERLIQUID_ANALYZE_FUNDING_ARB` returns empty at every threshold (AUTO-PERPS-3) — use `HYPERLIQUID_ANALYZE_DELTA_NEUTRAL` (same long-spot/short-perp strategy) instead.
- `HYPERLIQUID_ANALYZE_DELTA_NEUTRAL` default `maxMarkets` is too small and can misreport "no opportunities" (AUTO-PERPS-9) — always pass `maxMarkets: 50` or higher.
- `HYPERLIQUID_GET_FILL_HISTORY` can be empty right after a fill due to indexing lag (AUTO-PERPS-10) — cross-check `HYPERLIQUID_GET_ORDER_HISTORY` before concluding no fills.
- `HYPERLIQUID_CLOSE_POSITION` does not confirm fill price/PnL (AUTO-PERPS-13) — follow every close with `HYPERLIQUID_GET_POSITIONS`/`HYPERLIQUID_GET_ACCOUNT_RISK` to confirm flat, and `HYPERLIQUID_GET_ORDER_HISTORY` for realized PnL.
- `HYPERLIQUID_GET_TRADE_PREFLIGHT` ignores the `leverage` param in size/capacity rows (AUTO-PERPS-14) — when sizing at non-account leverage, compute `notional / price` yourself.
- `HYPERLIQUID_GET_OPEN_ORDERS` labels position TP/SL triggers as generic "Limit (Reduce)" (AUTO-PERPS-12) — if TP/SL identity matters, cross-reference `HYPERLIQUID_GET_ORDER_HISTORY`, which labels them correctly.

Funding the account: see `auto-fund-venues` (USDC bridged to `hypercore`).

---

# Auto Prediction Markets

Use this card for Polymarket-style discovery and trading. Trading tools cannot discover markets; discovery must produce a concrete `token_id` before a trade.

## Sequence

0. Confirm the venue is funded: `USER_WALLET_INFO` → "Polymarket (funded for trading)" must cover the order size. If short, run `auto-fund-venues` first — every trade on an unfunded account fails with `insufficient_balance`.
1. Discover the market by topic, event, sport, team, date, or market slug.
2. Select the exact outcome and copy the `token_id`.
3. Check price, liquidity, rules, close time, and whether the market is live.
4. Run `auto-risk-manager`.
5. Trade only when amount, outcome, side, and `token_id` are explicit.

## Trade Rules

- Minimum order is $1.
- Valid price bounds are 0.01 to 0.99. Do not rely on the tool's own out-of-range message; it can misstate the range — stay inside 0.01–0.99 regardless.
- YES/NO must match the chosen market outcome; do not infer from a headline alone.
- `token_id` is not `condition_id`. Use the long token id returned by discovery.
- `SEARCH_POLYMARKETS.limit` bounds events returned, not individual markets.
- For limit orders, respect the user's price. For market orders, warn about thin liquidity.

## Sports and Outrights

- For sports, confirm league, teams, start time, and whether the game has started.
- For outrights, check whether the market is winner-take-all, multiple-resolution, or includes settlement caveats.
- Do not bet stale lines if discovery shows the market closed, resolved, or unavailable.

## Balance Reads

- Read Polymarket cash from `USER_WALLET_INFO` → "Polymarket (funded for trading)". Avoid `GET_POLYMARKET_BALANCE` for funding checks — it reads the CLOB exchange portfolio, not deposit-wallet cash, and has reported $0 for funded accounts (fix shipped in `atnmsxyz/auto`, pending rollout). Details: `auto-fund-venues`.

## Redeem and Exit

- Use position reads before selling or redeeming.
- Sell active positions to exit before resolution.
- Redeem only resolved positions that are eligible for payout.

## Voice

Be precise and probability-native: "buy YES at 42c for $25" is clearer than "bet on it." Surface uncertainty instead of improvising missing market details.

---

# Auto Fund Venues

Use this card whenever a venue balance is too small for the intended trade. Each venue has its own collateral model — bridging "USDC to Polygon" is NOT the same as funding Polymarket. Get the recipient, token, or provider wrong and funds strand on an address the venue never reads.

## Decision Flow

1. Detect the target venue (Polymarket or Hyperliquid) and the amount needed.
2. Read current funded balance (see Balance Reads below). If sufficient, stop — do not bridge.
3. Compute the deposit: order size + fees buffer (bridges cost ~30–60 bps plus gas time).
4. Run the venue-specific sequence below, with the Execution Safety rails.
5. Poll arrival, confirm with the correct balance read, then hand back to the trading skill.

## Balance Reads

- Read venue cash from `USER_WALLET_INFO`: the "Polymarket (funded for trading)" section for PM collateral, the Hyperliquid Perps section for HL account value.
- Do not use `GET_POLYMARKET_BALANCE` to confirm funding — it reads the CLOB exchange portfolio, not deposit-wallet cash, and historically reported $0 for funded accounts (fix shipped in `atnmsxyz/auto`, may not be rolled out to your gateway yet).

## Hyperliquid (one bridge call)

HL perp collateral is USDC delivered to the `hypercore` chain.

1. `USER_WALLET_BRIDGE_QUOTE {originChain:"base", destinationChain:"hypercore", currency:"USDC", amount:"<n>"}`
2. `USER_WALLET_BRIDGE_EXECUTE` with the same params. Credits HL account value in ~30s via relay.
3. Confirm via `HYPERLIQUID_GET_ACCOUNT_RISK` or `USER_WALLET_INFO`.

## Polymarket (four facts, all load-bearing)

1. **Recipient must be the PM deposit wallet, not your signer.** Get `depositWalletAddress` from a fresh `POLYMARKET_SETUP_TRADING` call. Bridging to your own signer address does NOT credit Polymarket.
2. **Token must be USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` on Polygon), set explicitly via `toCurrency`. A default same-symbol bridge delivers native USDC (`0x3c499...`), which Polymarket does not accept as collateral.
3. **Pin a known-good provider** (`across` or `relay`). Auto-select has returned unexecutable `uniswap-bridge` quotes on base→polygon (fix shipped in `atnmsxyz/auto`; keep pinning until confirmed on your gateway).
4. **Confirm arrival via `USER_WALLET_INFO` → "Polymarket (funded for trading)"** — see Balance Reads.

Verified working call shape:

```
USER_WALLET_BRIDGE_EXECUTE {
  originChain: "base", destinationChain: "polygon", currency: "USDC",
  toCurrency: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  recipient: "<depositWalletAddress>", amount: "<n>", provider: "across"
}
```

Exit nuance: sell proceeds land as **pUSD**, not USDC.e. A full cash-out to Base is pUSD → USDC.e → bridge back.

## Execution Safety (applies to every swap/bridge write)

- **Reject same-token swaps.** `fromToken == toToken` quotes are accepted by the tools and lose ~0.4% for nothing. Refuse before quoting.
- **Fresh quote immediately before execute.** Execute tools can self-quote from ambiguous params and fire a real transfer. Always run `USER_WALLET_BRIDGE_QUOTE` / `USER_WALLET_SWAP_QUOTE` first, carry `quotedAmountIn` into the execute call, and never execute on a stale or absent quote.
- **Pin the provider on any route where auto-select returns `uniswap-bridge`.** Prefer `across`, `relay`, or `debridge`.
- **Only poll status for a hash an execute call actually returned.** `USER_WALLET_SWAP_STATUS` reports `pending` even for unknown/never-broadcast hashes; treat status on a hash you didn't receive as suspect. If a bridge strands, `USER_WALLET_BRIDGE_RECOVER` is the recovery path.

## Voice

State amounts, fees, and settlement time before executing. Never bridge more than the user asked to deploy.

---

# Auto Risk Manager

Run this before every write. Tool availability is not permission. The user's instruction and current account state must both support the action.

## Required Checklist

- Balance and available collateral for the venue.
- Current exposure by symbol/market and total portfolio concentration.
- Open orders that could conflict, double-fill, or hide risk.
- Existing TP/SL or reduce-only protection.
- Position side, size, leverage, liquidation distance, and margin mode when perps are involved.
- User-stated constraints: max loss, stop, target, time horizon, no-trade zones.
- Fees, slippage, funding, or settlement delay when material.
- For swaps and bridges: slippage tolerance and quote-vs-execute staleness.
- For bridges: recover flow existence before execution.
- For transfers and bridges: wrong-chain and wrong-address recipient risk.

## Stop Conditions

Stop and ask when:

- Size, side, market, token_id, leverage, or price is missing.
- The user asks for "all in" without acknowledging risk.
- A trade would violate stated constraints.
- You cannot tell whether the action opens, closes, or modifies risk.
- The tool result is stale or contradicts the user's premise.

## Communication

State the risk in user terms: amount at risk, notional, max likely loss, liquidation distance, and what happens next. If unsure, say exactly what is uncertain and what read would resolve it.

## Permission Boundary

Never infer consent from a visible write tool. Read + Write keys can place trades, but every write still needs a clear user instruction in the conversation.

---

# Auto Trading Brain

Use a markdown brain when the client has filesystem access. If no filesystem is available, degrade to chat-rendered notes and tell the user what to save.

## First Run

Offer to scaffold:

```text
brain/
  journal/
  research/
  watchlists/
  playbooks/
  weekly/
  lessons.md
```

Use Obsidian-friendly markdown: YAML frontmatter, clear headings, and `[[wikilinks]]`.

## Journal Frontmatter

```yaml
---
type: trade
venue: hyperliquid
symbol: BTC
size: "$150 notional"
r_multiple: 2.1
outcome: open
---
```

For bets, use `type: bet`, `venue: polymarket`, `symbol:` as the market title, and `outcome:` as open/won/lost/sold/redeemed.

## Soft Rules

- Journal before and after every write.
- Re-read `brain/lessons.md` before new writes.
- Cite applied lessons in the pre-trade note.
- Link research notes to journal entries.
- Add one lesson after a meaningful win, loss, mistake, or avoided trade.

## Weekly Review

Summarize win rate, average R, worst mistake, best process, recurring setup, and one rule to change. Keep it short enough to reread before trading.
