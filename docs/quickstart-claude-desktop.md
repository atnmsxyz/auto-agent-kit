# Claude Desktop Quickstart

1. Create an Auto API key: **Read** for research, **Read + Write** for trading.
2. Understand the consent copy: paid reads may charge USDC from your Auto wallet; write keys can place trades and cannot withdraw.
3. Add an MCP server to `claude_desktop_config.json`:

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

4. Restart Claude Desktop.
5. Ask it to list Auto tools and call a read-only tool before using trading surfaces.
