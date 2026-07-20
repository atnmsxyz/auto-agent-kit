# Auto Agent Kit

Auto Agent Kit lets **any** MCP-capable agent — Claude Code, Claude Desktop,
Codex, Cursor, Windsurf, Cline, Gemini CLI, Hermes, or your own harness — use
[Auto](https://auto.fun) through an interactive setup CLI and a thin MCP runtime,
plus portable operating rules and Claude plugins.

## Quick start (any harness)

1. Start the setup wizard:

   ```bash
   npx -y @atnms/auto-cli@latest setup
   ```

2. Sign in to Auto in the browser, choose **Read** or **Read + Write**, then approve the visible tool set.
3. Let the wizard store the key in an owner-only local profile and configure your MCP client without copying the key into its config.
4. Restart the client and ask it to list Auto tools.
5. (Optional) Load the matching rules bundle from [`rules/`](rules/README.md) so
   the agent follows Auto's risk and execution discipline.
6. Trade only after the risk rules have checked the setup.

The wizard supports Claude Code, Claude Desktop, Codex, Cursor, Windsurf, VS Code,
and Gemini CLI. Manual examples remain in [`examples/`](examples/README.md) for
environments where browser handoff is unavailable.

## API access and visible tools

These are separate controls. **Read** or **Read + Write** is enforced by Auto on
every request. A surface or custom category only controls which tools the agent
sees and cannot grant more permission than the key has.

| Surface | Best for | Key | Tools |
|---|---|---|---|
| `research` | market data, macro, Polymarket discovery | Read | ~230 read tools |
| `perps` | Hyperliquid perps with research + risk checks | Read + Write | perps + research + venue funding |
| `trading` | full agent: perps, Polymarket, wallet execution* | Read + Write | ~277 tools |

\* Wallet execution includes swap, bridge, and Solana-transfer tools.

The wizard also offers an Advanced custom profile for selecting API access and
visible categories independently. Research is the safest default.

## Why this is different

- Client config needs only `AUTO_MCP_PROFILE`. The API key stays in the protected local profile; no private key ever exists client-side.
- Read + Write keys can trade through the MCP gateway, but cannot withdraw or transfer funds out.
- Paid data settles per call as USDC on Base from the user's own Auto wallet. Charged receipts include `settlementId`, the Base transaction hash.
- Non-KYC venue coverage includes Hyperliquid and Polymarket.
- One guided setup connects the thin MCP runtime and exposes the approved tool set.

## Rules and skills

The kit ships the agent's operating discipline in two forms, both generated from
one source (`skills/`):

- **Portable rules** ([`rules/`](rules/README.md)) — plain markdown any harness
  can load (Codex/Cursor `AGENTS.md`, Windsurf, a system prompt). One bundle per surface.
- **Claude skills** ([`skills/`](skills/)) — the same guidance as Claude skill cards.

| Rule / skill | Enforces |
|---|---|
| `connect-auto-mcp` | setup, surface choice, validation, troubleshooting |
| `auto-research-analyst` | market, macro, and prediction-market research |
| `auto-perps-trader` | Hyperliquid perps sizing, leverage, and TWAP rules |
| `auto-prediction-markets` | Polymarket discovery → token id → trade flow |
| `auto-fund-venues` | funding Polymarket/Hyperliquid: deposit wallets, collateral tokens, bridge safety |
| `auto-risk-manager` | pre-write checklist for every trade |
| `auto-trading-brain` | markdown/Obsidian journal and lessons system |

Regenerate rules after editing a skill: `node scripts/build-rules.mjs`.

## Claude Code plugins (one-click)

Claude Code users can skip manual config: add this repo as a marketplace and
install a plugin that bundles the MCP surface and skills.

1. Add the marketplace from this repo (`.claude-plugin/marketplace.json`).
2. Install `auto-research`, `auto-perps`, or `auto-trading`.
3. Run the setup wizard and select the plugin's matching profile. Do not paste credentials into an LLM conversation.

## Billing

Paid data tools charge small USDC amounts from your Auto wallet on Base. Trading
tools are wallet-native and not x402-billed. Default paid-data cap is $10 per key
per day. Receipts report whether a call was charged, cached, local-free, or blocked.

## Docs

Start with [`docs/api-keys.md`](docs/api-keys.md) and
[`docs/quickstart-claude-code.md`](docs/quickstart-claude-code.md),
[`docs/quickstart-codex.md`](docs/quickstart-codex.md), and [`docs/billing.md`](docs/billing.md).
Operational references: [`docs/token-data.md`](docs/token-data.md),
[`docs/errors-and-limits.md`](docs/errors-and-limits.md).
Full user-facing docs live at [docs.auto.fun](https://docs.auto.fun).
