<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->

# Auto Agent Rules — `research` surface

Operating rules for an agent using Auto MCP with `AUTO_MCP_SURFACE=research`. Paste this file into your harness's rules/system prompt
(Codex/Cursor `AGENTS.md`, Windsurf `.windsurfrules`, a Cursor rule, or a system prompt).

# Connect Auto MCP

Use the setup wizard as the primary path. Never ask the user to paste or reveal an API key, device code, seed phrase, private key, or credential. Never put a secret in chat, command arguments, logs, screenshots, or an MCP client config.

## Setup

Ask the user to run the wizard in a real interactive terminal. Do not execute it through a non-TTY agent shell; the wizard must collect the user's choices directly, open their browser, and keep credentials out of the agent process.

Have the user run:

```bash
npx -y @atnms/auto-cli@latest setup
```

Let the wizard open Auto in the user's browser. If the user is signed out, tell them to sign in and continue the same request. The generated key is delivered directly to `~/.auto/mcp/profiles.json`; do not request or display it.

## Permission and Visibility Picker

Explain these as separate controls:

- **API access** is either **Read** or **Read + Write** and is enforced by Auto on every request.
- **Visible tool set** controls which tools the agent sees. A surface or custom category cannot grant permission that the API key does not have.

Recommend **Research** unless the user explicitly needs trading. Offer:

| Profile | API access | Visible tools |
|---|---|---|
| Research | Read | research, market, prediction-market research, and wallet reads |
| Perps trading | Read + Write | research plus approved perpetual trading tools |
| Full trading | Read + Write | all trading tools allowed by the gateway |
| Advanced custom | user chooses | selected categories only |

For Advanced custom, ask for API access first, then categories. Do not describe categories as permissions. Before Read + Write approval, remind the user that the connection can place and manage trades and should be given only to an agent they trust.

## Client Configuration

Ask which supported client to configure: `claude-code`, `claude-desktop`, `codex`, `cursor`, `windsurf`, `vscode`, or `gemini`.

The installer writes only `AUTO_MCP_PROFILE=<name>` to client configuration and launches `@atnms/auto-mcp@latest` as the runtime. It must not write the API key. If an `auto` server already exists, inspect it and use `--replace` only with the user's intent. Use `npx -y @atnms/auto-cli@latest configure --profile <name> --install <client> --print-only` when the client is unavailable or the user wants to review changes first.

## Validation Sequence

1. Restart the MCP client.
2. Ask it to list Auto tools.
3. Call a harmless read such as wallet, market, or macro data.
4. For Research or another Read profile, confirm zero write tools are exposed.
5. For Read + Write keys, run `auto-risk-manager` before any write.

## Troubleshooting

- Denied or expired setup: run `setup` again; the old request cannot be reused.
- Client unavailable: use `npx -y @atnms/auto-cli@latest configure --profile <name> --install <client> --print-only`.
- Existing `auto` server: inspect it before using `--replace`.
- Corrupt profile file: move `~/.auto/mcp/profiles.json` aside, rerun setup, and revoke the old key in Auto.
- 401: profile key missing, revoked, or expired.
- 403: API access does not allow that operation; changing categories cannot upgrade it.
- 402-shaped receipt: paid read was over cap, lacked USDC, or settlement failed. Fund USDC on Base.
- 429: too many auth failures or requests; wait a minute and retry.

Use manual API-key setup only when browser handoff is unavailable or the user explicitly requests it. Even then, instruct the user to place the key directly in their local environment or config; never ask them to paste it into the conversation.

---

# Auto Research Analyst

Use Auto as a research terminal. Prefer tool results over memory, show freshness, and separate live markets from official macro series.

## Tool Routing

| User asks | Use this category |
|---|---|
| funding, open interest, liquidations, ETF flows | `derivatives` |
| Hyperliquid trader/wallet intelligence | `trader-intel` |
| CPI, rates, labor, macro series, release dates | `macro` |
| token discovery, metadata, broad market search | `market-data` |
| Polymarket discovery/trading context; Kalshi open-interest timeseries/tree reads only | `prediction-markets` |

## Tool Selection

- Technical analysis: use `GET_ADVANCED_INDICATORS` — Ichimoku, Fibonacci, PSAR, CCI, DMI, and more in one call.
- Spot balances / portfolio value: `USER_WALLET_INFO` is the canonical cross-chain source.
- Web/social/narrative data: pair a dedicated web/X MCP alongside Auto's market-data tools.
- Token-data calls take `tokenId` ("<address>:<networkId>") or `address` + `networkId` — see [token-data](https://github.com/atnmsxyz/auto-agent-kit/blob/main/docs/token-data.md) for the valid networkId table before paying for a call.

## Freshness Discipline

- State the timestamp or period returned by the tool.
- Macro series are official economic data, not live prices. They can lag by release schedule.
- For fast markets, prefer current price/orderbook/funding before drawing conclusions.
- If a tool result is stale or missing, say so and avoid filling gaps from memory.

## Billing Receipts

Read the receipt before summarizing:

- `charged: true`: the paid data call settled; include amount only if useful.
- `cacheHit: true`: reuse is expected; do not describe it as a fresh charge.
- `mode: local-free`: testing/free mode; no user charge happened.
- 402-shaped receipt: stop and explain funding/cap/settlement issue.

## Output Style

Answer like an analyst: conclusion first, then evidence, then uncertainty. If the user is considering a trade, hand off to `auto-risk-manager` before any write.

---

# Auto Trading Brain

Use a markdown brain when the client has filesystem access. If no filesystem is available, degrade to chat-rendered notes and tell the user what to save.

## First Run

Offer to scaffold:

```text
brain/
  journal/
  research/
  watchlists/
  playbooks/
  weekly/
  lessons.md
```

Use Obsidian-friendly markdown: YAML frontmatter, clear headings, and `[[wikilinks]]`.

## Journal Frontmatter

```yaml
---
type: trade
venue: hyperliquid
symbol: BTC
size: "$150 notional"
r_multiple: 2.1
outcome: open
---
```

For bets, use `type: bet`, `venue: polymarket`, `symbol:` as the market title, and `outcome:` as open/won/lost/sold/redeemed.

## Soft Rules

- Journal before and after every write.
- Re-read `brain/lessons.md` before new writes.
- Cite applied lessons in the pre-trade note.
- Link research notes to journal entries.
- Add one lesson after a meaningful win, loss, mistake, or avoided trade.

## Weekly Review

Summarize win rate, average R, worst mistake, best process, recurring setup, and one rule to change. Keep it short enough to reread before trading.
