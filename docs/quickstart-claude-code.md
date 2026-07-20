# Claude Code Quickstart

1. Run the wizard and choose `claude-code` when asked which client to install:

```bash
npx -y @atnms/auto-cli@latest setup
```

2. Choose **Research / Read** unless Claude Code is explicitly allowed to trade. Approve the request in Auto; the wizard keeps the key out of Claude's config and the conversation.
3. Optionally install the matching rules plugin:

```text
/plugin marketplace add <this-repo-url>
/plugin install auto-research
```

Use `auto-perps` or `auto-trading` when you intentionally want write-capable tools.

4. Restart Claude Code. Ask it to list Auto tools, confirm Research has zero write tools, then run one harmless read.

If browser handoff is unavailable, use the manual examples without pasting the key into an LLM conversation.
