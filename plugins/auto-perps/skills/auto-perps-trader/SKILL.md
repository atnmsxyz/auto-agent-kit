---
name: auto-perps-trader
description: Use when trading or analyzing Hyperliquid perps through Auto MCP.
---

# Auto Perps Trader

Use for Hyperliquid perpetual futures. Deposits, withdrawals, transfers, staking, and treasury moves are not available over MCP; tell the user to fund in the Auto app.

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
