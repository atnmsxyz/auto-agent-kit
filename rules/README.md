# Auto Agent Rules (portable)

<!-- Generated from skills/ by scripts/build-rules.mjs. Do not edit by hand. -->

These are harness-neutral versions of the Claude skill cards in `skills/`. Any
agent that reads markdown rules can use them — no Claude required.

## Per-surface bundles

Pick the file that matches your `AUTO_MCP_SURFACE` and load it into your harness:

| Surface | Bundle |
|---|---|
| `research` | [AGENTS.research.md](AGENTS.research.md) |
| `perps` | [AGENTS.perps.md](AGENTS.perps.md) |
| `trading` | [AGENTS.trading.md](AGENTS.trading.md) |

Where to put it:

- **Codex** — append to `AGENTS.md` in your project.
- **Cursor** — save as a `.cursor/rules/auto.mdc` rule (or `.cursorrules`).
- **Windsurf** — append to `.windsurfrules`.
- **Cline / Continue / VS Code** — add to the assistant's custom instructions.
- **Any other harness** — paste into the system prompt or rules file.

## Individual rules

- [auto-perps-trader.md](auto-perps-trader.md)
- [auto-prediction-markets.md](auto-prediction-markets.md)
- [auto-research-analyst.md](auto-research-analyst.md)
- [auto-risk-manager.md](auto-risk-manager.md)
- [auto-trading-brain.md](auto-trading-brain.md)
- [connect-auto-mcp.md](connect-auto-mcp.md)

Regenerate after editing `skills/`: `node scripts/build-rules.mjs`
