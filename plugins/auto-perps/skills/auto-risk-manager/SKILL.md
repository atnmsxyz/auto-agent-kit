---
name: auto-risk-manager
description: Use before every trading write, including perps, prediction markets, wallet execution, and order changes.
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
