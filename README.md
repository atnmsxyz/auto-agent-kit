# Auto Agent Kit

Auto Agent Kit lets Claude, Codex, Hermes, and other MCP clients use Auto through a simple package and public skill cards.

Noob path:

1. Add the Claude Code marketplace from this repo.
2. Install `auto-research`, `auto-perps`, or `auto-trading`.
3. Create an Auto API key in the UI.
4. Paste the `atk_...` key.
5. Ask the agent to list Auto tools.
6. Trade only after the risk card has checked the setup.

## Why this is different

- Client config needs `AUTO_API_KEY`. No private key exists client-side.
- Read + Write keys can trade through the MCP gateway, but cannot withdraw or transfer funds.
- Paid data settles per call as USDC on Base from the user's own Auto wallet. Charged receipts include `settlementId`, the Base transaction hash.
- Non-KYC venue coverage includes Hyperliquid and Polymarket.
- One `npx` install exposes 230+ research tools or 277 trading tools.

## Surfaces

| Surface | Best for | Key |
|---|---|---|
| `research` | market data, macro, Polymarket discovery | Read |
| `perps` | Hyperliquid perps with research and risk checks | Read + Write |
| `trading` | full trading agent: perps, Polymarket, wallet execution* | Read + Write |

* Wallet execution includes swap, bridge, and Solana-transfer tools.

Manual MCP command:

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

`AUTO_MCP_CATEGORIES` is a power-user override. Use `AUTO_MCP_SURFACE` first.

## Billing

Paid data tools can charge small USDC amounts from your Auto wallet on Base. Trading tools are not x402-billed. Default daily paid-data cap is $10 per key. Receipts report whether a call was charged, cached, local-free, or blocked.

## Skills

- `connect-auto-mcp`: setup, surface choice, validation, troubleshooting.
- `auto-research-analyst`: market, macro, and prediction-market research.
- `auto-perps-trader`: Hyperliquid perps execution rules.
- `auto-prediction-markets`: discovery-to-token-id-to-trade flow.
- `auto-risk-manager`: pre-write checklist for every trade.
- `auto-trading-brain`: markdown/Obsidian journal and lessons system.

## Docs

Start with `docs/quickstart-claude-code.md`, `docs/api-keys.md`, and `docs/billing.md`.
