# Claude Code Quickstart

1. In Auto, open the profile menu -> Account modal -> Account tab -> API Keys section.
2. Create **Read** for research or **Read + Write** for trading. The consent copy means paid data tools can charge small USDC amounts from your Auto wallet; Read + Write can place trades but cannot withdraw.
3. Install the marketplace, then the plugin:

```text
/plugin marketplace add <this-repo-url>
/plugin install auto-research
```

Use `auto-perps` or `auto-trading` when you intentionally want write-capable tools.

4. Paste the `atk_...` key when Claude Code asks for `AUTO_API_KEY`, or export it before launch:

```bash
export AUTO_API_KEY=atk_...
```

5. Validate: ask Claude to list Auto tools, then run one harmless read.
