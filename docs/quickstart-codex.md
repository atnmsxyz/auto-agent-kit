# Codex Quickstart

1. Run the wizard and choose `codex` when asked which client to install:

```bash
npx -y @atnms/auto-cli@latest setup
```

2. Choose **Research / Read** unless this Codex session is allowed to trade. Choose **Read + Write** only for explicit trading work.
3. Approve in the browser. The wizard stores the key in an owner-only local profile and adds only `AUTO_MCP_PROFILE` to Codex.
4. Restart Codex and ask it to list Auto tools. Confirm Research exposes zero write tools.

For manual recovery when browser handoff is unavailable, add an MCP server to Codex config:

```toml
[mcp_servers.auto]
command = "npx"
args = ["-y", "@atnms/auto-mcp@latest"]

[mcp_servers.auto.env]
AUTO_MCP_PROFILE = "research"
```

Do not paste an API key into an LLM conversation.
