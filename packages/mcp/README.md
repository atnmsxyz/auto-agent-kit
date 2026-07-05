# Auto MCP Package

Thin stdio proxy for the Auto MCP Gateway.

## Run

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

## Add to Claude Code / Claude Desktop

Claude Code:

```bash
claude mcp add auto -e AUTO_API_KEY=atk_... -e AUTO_MCP_SURFACE=research -- npx -y @atnms/auto-mcp
```

Project `.mcp.json`:

```json
{
  "mcpServers": {
    "auto": {
      "command": "npx",
      "args": ["-y", "@atnms/auto-mcp"],
      "env": {
        "AUTO_API_KEY": "atk_...",
        "AUTO_MCP_SURFACE": "research"
      }
    }
  }
}
```

Use the same server block in Claude Desktop's `claude_desktop_config.json`.

## Environment

- `AUTO_API_KEY` is required.
- `AUTO_API_URL` defaults to `https://auto.fun` (production). Override only for staging or local testing.
- `AUTO_MCP_SURFACE` is `research`, `perps`, or `trading`.
- `AUTO_MCP_CATEGORIES` is a power-user comma-separated category override. It is forwarded as `categories`.
- `AUTO_MCP_GATEWAY_CATEGORIES` is the legacy/internal name for `AUTO_MCP_CATEGORIES`. `AUTO_MCP_CATEGORIES` wins when both are set.
- `AUTO_MCP_GATEWAY_PATH` overrides the gateway path. Internal/dev only.
- `AUTO_MCP_DEV_GATEWAY=true` switches the default path to `/api/dev/mcp`. Internal/dev only.
