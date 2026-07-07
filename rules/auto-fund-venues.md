<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->

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

1. `USER_WALLET_BRIDGE_QUOTE {originChain:"base", destinationChain:"hypercore", currency:"USDC", amount:"<n>"}` — note the returned `quotedAmountIn`.
2. `USER_WALLET_BRIDGE_EXECUTE` with the same params **plus the `quotedAmountIn` from step 1**. Never execute without a fresh quote (see Execution Safety). Credits HL account value in ~30s via relay.
3. Confirm via `HYPERLIQUID_GET_ACCOUNT_RISK` or `USER_WALLET_INFO`.

## Polymarket (four facts, all load-bearing)

1. **Recipient must be the PM deposit wallet, not your signer.** Get `depositWalletAddress` from a fresh `POLYMARKET_SETUP_TRADING` call. Bridging to your own signer address does NOT credit Polymarket.
2. **Token must be USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` on Polygon), set explicitly via `toCurrency`. A default same-symbol bridge delivers native USDC (`0x3c499...`), which Polymarket does not accept as collateral.
3. **Pin a known-good provider** (`across` or `relay`). Auto-select has returned unexecutable `uniswap-bridge` quotes on base→polygon (fix shipped in `atnmsxyz/auto`; keep pinning until confirmed on your gateway).
4. **Confirm arrival via `USER_WALLET_INFO` → "Polymarket (funded for trading)"** — see Balance Reads.

Verified working call shape — quote first, then execute carrying `quotedAmountIn`:

```
USER_WALLET_BRIDGE_QUOTE {
  originChain: "base", destinationChain: "polygon", currency: "USDC",
  toCurrency: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  recipient: "<depositWalletAddress>", amount: "<n>", provider: "across"
}
// → returns quotedAmountIn; execute immediately after:
USER_WALLET_BRIDGE_EXECUTE {
  ...same params, quotedAmountIn: "<from the quote>"
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
