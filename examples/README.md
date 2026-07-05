# Client Config Examples

Every example runs the same universal command — only the config file and its
location change per client. Replace `atk_REPLACE_ME` with your Auto API key and
pick a surface (`research`, `perps`, or `trading`).

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

| Client | Example | Where it goes |
|---|---|---|
| Claude Code | [claude-code/mcp.json](claude-code/mcp.json) | project `.mcp.json` (or `claude mcp add`) |
| Claude Desktop | [claude-desktop/claude_desktop_config.json](claude-desktop/claude_desktop_config.json) | `claude_desktop_config.json` |
| Codex | [codex/config.toml](codex/config.toml) | `~/.codex/config.toml` |
| Cursor | [cursor/mcp.json](cursor/mcp.json) | project `.cursor/mcp.json` |
| Windsurf | [windsurf/mcp_config.json](windsurf/mcp_config.json) | `~/.codeium/windsurf/mcp_config.json` |
| VS Code | [vscode/mcp.json](vscode/mcp.json) | project `.vscode/mcp.json` (uses `servers`) |
| Gemini CLI | [gemini-cli/settings.json](gemini-cli/settings.json) | `~/.gemini/settings.json` |
| Hermes / other | [hermes/README.md](hermes/README.md) | same process contract |

Most MCP clients (Cursor, Windsurf, Cline, Continue, Claude) use the
`mcpServers` shape. VS Code's native MCP uses a `servers` key; Codex uses TOML.
If your client isn't listed, use any of the JSON examples as a template — the
`command`, `args`, and `env` are identical everywhere.

After configuring, restart the client and ask it to list Auto tools. To give the
agent Auto's operating rules, load the matching bundle from [`../rules/`](../rules/README.md).
