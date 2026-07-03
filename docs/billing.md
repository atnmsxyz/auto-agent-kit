# Billing

Paid data calls use server-signed x402. Auto signs a USDC authorization from your Auto wallet on Base and settles it before returning paid data. MCP clients do not need wallets or payment libraries.

Trading tools are wallet-native and are not x402-billed.

## Prices

| Category | USD per call |
|---|---:|
| coinglass | 0.005 |
| hyperintel / nansen-backed | 0.010 |
| macro / FRED | 0.002 |
| market-data discovery/search | 0.002 |
| social / ct-alpha | 0.005 |
| tool listing, own wallet/positions/orders, orderbook and safety reads | free |

Default spend cap: $10 per key per day.

## Receipts

- `charged: true` means settlement succeeded.
- `cacheHit: true` means the paid data cache answered; do not count it as a new charge.
- `mode: local-free` means no charge happened.
- 402-shaped receipts explain over-cap, insufficient USDC, or settlement failure.

Fund your Auto wallet with USDC on Base before using paid reads in x402 mode.
