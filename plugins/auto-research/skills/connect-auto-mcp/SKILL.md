---
name: connect-auto-mcp
description: Use when setting up, configuring, validating, or troubleshooting Auto MCP in Claude Code, Claude Desktop, Codex, Cursor, Windsurf, VS Code, Gemini CLI, or another MCP client.
---

# Connect Auto MCP

Use the setup wizard as the primary path. Never ask the user to paste or reveal an API key, device code, seed phrase, private key, or credential. Never put a secret in chat, command arguments, logs, screenshots, or an MCP client config.

## Setup

Ask the user to run the wizard in a real interactive terminal. Do not execute it through a non-TTY agent shell; the wizard must collect the user's choices directly, open their browser, and keep credentials out of the agent process.

Have the user run:

```bash
npx -y @atnms/auto-cli@latest setup --profile research --preset research
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
