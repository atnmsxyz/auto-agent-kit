# Auto CLI

Interactive, profile-based setup for [Auto](https://auto.fun) MCP clients.

## Setup

```bash
npx -y @atnms/auto-cli@latest setup
```

The wizard:

1. asks which tools the agent should see;
2. opens Auto for sign-in and approval;
3. explains whether the key is **Read** or **Read + Write**;
4. stores the generated key in `~/.auto/mcp/profiles.json` with owner-only permissions;
5. optionally configures an MCP client using only `AUTO_MCP_PROFILE`.

Research / Read is the default. Read + Write can place and manage trades from
the connected wallet, so grant it only to an agent you trust. Tool surfaces and
categories control visibility; they cannot grant access that the key does not
have.

Supported clients are `claude-code`, `claude-desktop`, `codex`, `cursor`,
`windsurf`, `vscode`, and `gemini`.

## Review or install a saved profile

Print a client configuration without changing anything:

```bash
npx -y @atnms/auto-cli@latest configure \
  --profile research \
  --install codex \
  --print-only
```

Install it:

```bash
npx -y @atnms/auto-cli@latest configure \
  --profile research \
  --install codex
```

If a client already has an MCP server named `auto`, the CLI refuses to replace
it. Review the existing entry first, then rerun with `--replace` only when the
replacement is intentional. Direct JSON installers create a timestamped backup.

The installed client launches `@atnms/auto-mcp@latest`, the thin stdio runtime.
Neither generated config nor printed commands contain the API key.

## Non-interactive setup

Supply the required choices explicitly when no terminal is available:

```bash
npx -y @atnms/auto-cli@latest setup \
  --profile research \
  --preset research \
  --client "My agent" \
  --install codex
```

Advanced custom setup additionally requires `--access read|read_write` and a
comma-separated `--categories` list. Use `--no-open` when the browser must be
opened manually.
