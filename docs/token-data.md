# Token identifiers for token-data tools

The Codex-backed token tools (`GET_TOKEN_SNAPSHOT`, `GET_TOKEN_PAIRS`, `GET_DETAILED_TOKEN_STATS`, `GET_TOKEN_SPARKLINES`, `GET_TOKEN_EVENTS`, `GET_TOKEN_LIFECYCLE`, `GET_TOKEN_HOLDER_CONCENTRATION`, `SEARCH_TOKENS`) accept the same token identity in two interchangeable shapes:

1. Combined: `tokenId: "<address>:<networkId>"`
   `{"tokenId": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913:8453"}`
2. Separate: `address` + `networkId`
   `{"address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "networkId": 8453}`

Pass one shape, not both.

## networkId reference

| networkId | Chain |
|---|---|
| 1 | Ethereum |
| 10 | Optimism |
| 56 | BSC |
| 100 | Gnosis |
| 137 | Polygon |
| 250 | Fantom |
| 324 | zkSync Era |
| 8453 | Base |
| 42161 | Arbitrum |
| 43114 | Avalanche |
| 59144 | Linea |
| 534352 | Scroll |
| 7777777 | Zora |
| 81457 | Blast |
| 1399811149 | Solana |

Source: the chain-name map in `atnmsxyz/auto` (`plugin-codex-data/src/utils/formatters.ts`). Codex may support more networks than listed; unknown ids are formatted as `Chain <id>`.

## Validate before you pay

A wrong `networkId` is not rejected — the call silently returns empty/wrong data and still bills (see AUTO-TOKEN-4). Check the id against this table before calling, and treat an unexpectedly empty paid result as a possible charged non-answer, not proof of absence.
