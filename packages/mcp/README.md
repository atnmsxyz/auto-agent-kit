# Auto MCP Package

Thin stdio proxy for the Auto MCP Gateway.

## Setup

Interactive setup belongs to `@atnms/auto-cli`:

```bash
npx -y @atnms/auto-cli@0.1.0 setup
```

The wizard opens Auto for sign-in and approval, creates a Read or Read + Write
key, verifies the selected tool catalog, stores the key in
`~/.auto/mcp/profiles.json`, and can configure Claude Code, Claude Desktop,
Codex, Cursor, Windsurf, VS Code, or Gemini CLI. Client configuration contains
only `AUTO_MCP_PROFILE`; it does not contain the API key.

Research is the safest default. API access is enforced by Auto; surfaces and
categories only control tool visibility and cannot grant permission.

Review client configuration without changing it:

```bash
npx -y @atnms/auto-cli@0.1.0 configure \
  --profile research \
  --install all \
  --print-only
```

## Profile-backed server

On macOS or Linux, the wizard installs an equivalent server definition:

```json
{
  "mcpServers": {
    "auto": {
      "command": "npx",
      "args": ["-y", "@atnms/auto-mcp@0.4.0"],
      "env": {
        "AUTO_MCP_PROFILE": "research"
      }
    }
  }
}
```

On Windows, use the command-shell wrapper:

```json
{
  "mcpServers": {
    "auto": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@atnms/auto-mcp@0.4.0"],
      "env": {
        "AUTO_MCP_PROFILE": "research"
      }
    }
  }
}
```

Profiles are stored with owner-only file permissions. Use `--profile <name>` or
`AUTO_MCP_PROFILE=<name>` to select one. A directly supplied `AUTO_API_KEY`
remains available as a manual compatibility path and takes precedence.

`@atnms/auto-mcp` intentionally remains a thin stdio proxy. It loads the
selected profile, lists tools through Auto's HTTP gateway, and forwards tool
calls; browser authorization and client configuration stay in `@atnms/auto-cli`.

## Environment

- `AUTO_MCP_PROFILE` selects a saved local profile.
- `AUTO_API_KEY` is the legacy/manual credential path and takes precedence over a profile.
- `AUTO_API_URL` defaults to `https://auto.fun` (production). Override only for staging or local testing.
- `AUTO_MCP_SURFACE` is `research`, `perps`, or `trading`.
- `AUTO_MCP_CATEGORIES` is a power-user comma-separated category override. It is forwarded as `categories`.
- `AUTO_MCP_GATEWAY_CATEGORIES` is the legacy/internal name for `AUTO_MCP_CATEGORIES`. `AUTO_MCP_CATEGORIES` wins when both are set.
- `AUTO_MCP_GATEWAY_PATH` overrides the gateway path. Internal/dev only.
- `AUTO_MCP_DEV_GATEWAY=true` switches the default path to `/api/dev/mcp`. Internal/dev only.
