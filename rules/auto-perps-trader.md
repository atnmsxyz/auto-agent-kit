<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->

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
