# Claude Desktop Quickstart

1. Run the wizard and choose `claude-desktop` when asked which client to install:

```bash
npx -y @atnms/auto-cli@latest setup
```

2. Choose **Research / Read** unless Claude Desktop is explicitly allowed to trade. Approve in Auto; the wizard stores the key outside Claude's config.
3. Restart Claude Desktop and ask it to list Auto tools. Confirm Research exposes zero write tools.

For manual recovery when browser handoff is unavailable, add this profile-backed server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "auto": {
      "command": "npx",
      "args": ["-y", "@atnms/auto-mcp@latest"],
      "env": {
        "AUTO_MCP_PROFILE": "research"
      }
    }
  }
}
```

Do not paste an API key into an LLM conversation.
