# Codex Quickstart

1. Create an Auto API key in the UI.
2. Choose **Read** unless this Codex session is allowed to trade. Choose **Read + Write** only for explicit trading work.
3. The consent copy means paid data tools can charge small USDC amounts from your Auto wallet; Read + Write can place trades but cannot withdraw.
4. Add an MCP server to Codex config:

```toml
[mcp_servers.auto]
command = "npx"
args = ["-y", "@atnms/auto-mcp"]

[mcp_servers.auto.env]
AUTO_API_KEY = "atk_..."
AUTO_MCP_SURFACE = "research"
```

5. Restart Codex and ask it to list Auto tools.
