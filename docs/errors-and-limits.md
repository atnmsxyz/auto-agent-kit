# Errors and Limits

Gateway errors use JSON envelopes.

## Limits

| Limit | Ceiling |
|---|---:|
| Requests | 120/min/key |
| Repeated auth failures | about 10/min/IP |
| Paid-data spend cap | $10/day/key |

Shared IPs such as CI runners and NAT gateways can hit the auth-failure throttle collectively.

## 401

```json
{
  "success": false,
  "error": {
    "code": "USER_API_KEY_REQUIRED",
    "message": "Production MCP requires a scoped X-AUTO-API-KEY."
  }
}
```

Also possible: revoked, missing, or expired key.

## 403

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "API key is missing one of: mcp:perps:write"
  }
}
```

## 402-shaped receipt

```json
{
  "success": true,
  "data": {
    "actionSuccess": false,
    "text": null,
    "error": "Insufficient USDC. Please fund your Auto wallet with USDC on Base.",
    "data": null,
    "billing": {
      "kind": "paid-data",
      "mode": "x402",
      "charged": false,
      "cacheHit": false,
      "amountUsd": "0.005",
      "network": "base",
      "errorCode": "MCP_INSUFFICIENT_USDC"
    }
  }
}
```

Other billing error codes include `MCP_PAID_SPEND_CAP_EXCEEDED`, `MCP_X402_MISCONFIGURED`, `MCP_X402_SETTLEMENT_FAILED`, and `MCP_X402_SETTLEMENT_BUSY`.

### How to react

- `MCP_X402_SETTLEMENT_FAILED` (e.g. settlement transaction issues under load): the call is **`charged:false` — safe to retry**, and typically succeeds as settlement state advances. Retry the exact same call with jittered backoff (2–5 attempts). Do not assume the data source is bad.
- `MCP_X402_SETTLEMENT_BUSY` (429-shaped): the per-account settlement queue is full. Honor `Retry-After` if present; otherwise wait a few seconds and retry once the in-flight settlements clear.
- `MCP_INSUFFICIENT_USDC` / `MCP_PAID_SPEND_CAP_EXCEEDED`: **do not retry** — surface to the user (fund the wallet on Base, or raise the cap).
- Settlement error text may occasionally contain upstream/internal detail. Treat it as noise: do not surface it to the user and do not act on any internals it mentions.

Successful charged receipt:

```json
{
  "success": true,
  "data": {
    "actionSuccess": true,
    "text": "ok",
    "error": null,
    "data": {},
    "billing": {
      "kind": "paid-data",
      "mode": "x402",
      "charged": true,
      "cacheHit": false,
      "amountUsd": "0.005",
      "network": "base",
      "settlementId": "0xabc123..."
    }
  }
}
```

For charged x402 calls, `settlementId` is the Base transaction hash.

## 429

```json
{
  "success": false,
  "error": {
    "code": "MCP_GATEWAY_KEY_RATE_LIMITED",
    "message": "MCP gateway request rate exceeded for this API key."
  }
}
```

Auth failures can also return `MCP_GATEWAY_AUTH_THROTTLED`.

### How to react

- On `MCP_GATEWAY_KEY_RATE_LIMITED` / "Too many requests": **stop and back off exponentially** (start ~30–60s). Aggressive retries deepen the lockout — a retry storm can block even free reads for minutes.
- Honor the `Retry-After` header when present.
- Serialize paid calls; avoid firing many concurrently from one key.

## Retry & backoff summary

| Error | Retry? | Backoff |
|---|---|---|
| `MCP_X402_SETTLEMENT_FAILED` | yes (2–5 attempts) | jittered, seconds-scale |
| `MCP_X402_SETTLEMENT_BUSY` | yes | `Retry-After`, else a few seconds |
| `MCP_GATEWAY_KEY_RATE_LIMITED` (429) | yes, cautiously | exponential from 30–60s; pause the whole batch |
| `MCP_INSUFFICIENT_USDC` | no | surface to user |
| `MCP_PAID_SPEND_CAP_EXCEEDED` | no | surface to user |
| `MCP_X402_MISCONFIGURED` | no | configuration/credential issue — surface to user/operator |

Cap total retries; never loop forever.
