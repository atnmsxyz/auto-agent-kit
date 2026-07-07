---
name: auto-prediction-markets
description: Use when discovering, evaluating, or trading prediction markets through Auto MCP.
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
