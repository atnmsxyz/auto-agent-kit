---
name: auto-prediction-markets
description: Use when discovering, evaluating, or trading prediction markets through Auto MCP.
---

# Auto Prediction Markets

Use this card for Polymarket-style discovery and trading. Trading tools cannot discover markets; discovery must produce a concrete `token_id` before a trade.

## Sequence

1. Discover the market by topic, event, sport, team, date, or market slug.
2. Select the exact outcome and copy the `token_id`.
3. Check price, liquidity, rules, close time, and whether the market is live.
4. Run `auto-risk-manager`.
5. Trade only when amount, outcome, side, and `token_id` are explicit.

## Trade Rules

- Minimum order is $1.
- Valid price bounds are 0.001 to 0.999 unless the tool returns stricter limits.
- YES/NO must match the chosen market outcome; do not infer from a headline alone.
- `token_id` is not `condition_id`. Use the long token id returned by discovery.
- For limit orders, respect the user's price. For market orders, warn about thin liquidity.

## Sports and Outrights

- For sports, confirm league, teams, start time, and whether the game has started.
- For outrights, check whether the market is winner-take-all, multiple-resolution, or includes settlement caveats.
- Do not bet stale lines if discovery shows the market closed, resolved, or unavailable.

## Redeem and Exit

- Use position reads before selling or redeeming.
- Sell active positions to exit before resolution.
- Redeem only resolved positions that are eligible for payout.

## Voice

Be precise and probability-native: "buy YES at 42c for $25" is clearer than "bet on it." Surface uncertainty instead of improvising missing market details.
