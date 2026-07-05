# Billing

Paid data calls use server-signed x402. Auto signs a USDC authorization from your Auto wallet on Base and settles it before returning paid data. MCP clients do not need wallets or payment libraries.

Trading tools are wallet-native and are not x402-billed.

## Prices

| Category | USD per call |
|---|---:|
| derivatives | 0.005 |
| trader-intel | 0.010 |
| onchain-analytics | 0.010 |
| macro | 0.002 |
| market-data discovery/search | 0.002 |
| tool listing, own wallet/positions/orders, orderbook and safety reads | free |

Default spend cap: $10 per key per day.

## Receipts

- `charged: true` means settlement succeeded.
- `settlementId` on a charged x402 receipt is the Base transaction hash. Verify it at `https://basescan.org/tx/<settlementId>`.
- `cacheHit: true` means the paid data cache answered; do not count it as a new charge.
- Cache matches the same tool and params for the same user. The TTL is short.
- `mode: local-free` means no charge happened.
- 402-shaped receipts explain over-cap, insufficient USDC, or settlement failure.

## Where does the money come from?

Paid data uses USDC from the user's own Auto wallet on Base. Each charged call settles separately. There is no subscription and no shared off-chain ledger.

Fund the Auto wallet with USDC on Base before using paid reads in x402 mode.

## Category reference

`AUTO_MCP_CATEGORIES` is a comma-separated override. The proxy forwards the string to the gateway.

Current gateway category strings:

| Category |
|---|
| `market-data` |
| `macro` |
| `prediction-markets` |
| `derivatives` |
| `trader-intel` |
| `onchain-analytics` |
| `web-news` |
| `technicals` |
| `market-prices` |
| `defi-analytics` |
| `token-data` |

Social/X research tools are not available through this gateway and are not a
valid category. Pair a dedicated X/social MCP with Auto MCP if you need
timeline or narrative data.
