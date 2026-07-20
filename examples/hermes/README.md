# Hermes MCP Example

Hermes MCP configuration varies by build. Create a secure local profile first:

```bash
npx -y @atnms/auto-cli@latest setup --profile research --preset research
```

Then use the same profile-backed process contract as the other examples:

```bash
AUTO_MCP_PROFILE=research npx -y @atnms/auto-mcp@latest
```

For a trading agent, provision a separate Read + Write profile and use its name
in `AUTO_MCP_PROFILE`.
