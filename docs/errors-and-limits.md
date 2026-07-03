# Errors and Limits

Gateway errors use JSON envelopes.

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

Other billing error codes include `MCP_PAID_SPEND_CAP_EXCEEDED`, `MCP_X402_MISCONFIGURED`, and `MCP_X402_SETTLEMENT_FAILED`.

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
