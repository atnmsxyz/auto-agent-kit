---
name: connect-auto-mcp
description: Use when setting up Auto MCP in Claude Code, Claude Desktop, Codex, Hermes, or another MCP client.
---

# Connect Auto MCP

Use this card when someone wants Auto tools inside an external agent. Keep the setup simple: install the MCP package, paste an Auto API key, choose one surface, then validate.

## Install

Configure the MCP client to run:

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

`AUTO_API_URL` defaults to `https://auto.fun` (production). Set it only for staging or local testing.

## Surface Picker

| Surface | Use when | Tools exposed |
|---|---|---|
| `research` | analysis, market context, macro, prediction-market discovery | read tools only |
| `perps` | Hyperliquid perps agent with research and wallet/perps reads | research + perps order management |
| `trading` | full external trading agent | perps, prediction markets, wallet execution, risk reads |

`AUTO_MCP_CATEGORIES` exists for power users. Prefer `AUTO_MCP_SURFACE`.

## Key Flow

1. Open the profile menu -> Account modal -> Account tab -> API Keys section.
2. Create **Read** for research-only agents or **Read + Write** for agents allowed to trade.
3. Paste the one-time `atk_...` key into the MCP client config.
4. Read the consent copy: paid data tools charge small USDC amounts from the Auto wallet; Read + Write can place trades, no withdrawals.
5. Fund the Auto wallet with USDC on Base before using paid reads in x402 mode.

## Validation Sequence

1. Restart the MCP client.
2. Ask it to list Auto tools.
3. Call a harmless read such as wallet, market, or macro data.
4. For Read keys, confirm write tools are absent or return 403.
5. For Read + Write keys, run `auto-risk-manager` before any write.

## Troubleshooting

- 401: key missing, revoked, expired, or not pasted into the MCP process env.
- 403: the key cannot access that tool or surface.
- 402-shaped receipt: paid read was over cap, lacked USDC, or settlement failed. Fund USDC on Base.
- 429: too many auth failures or requests; wait a minute and retry.
