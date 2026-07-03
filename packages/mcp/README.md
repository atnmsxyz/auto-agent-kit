# Auto MCP Package

Thin stdio proxy for the Auto MCP Gateway.

```bash
AUTO_API_KEY=atk_... AUTO_MCP_SURFACE=research npx -y @atnms/auto-mcp
```

Environment:

- `AUTO_API_KEY` is required.
- `AUTO_API_URL` defaults to `https://trading.auto.fun`. TODO: switch to the final production host if it changes.
- `AUTO_MCP_SURFACE` is `research`, `perps`, or `trading`.
- `AUTO_MCP_CATEGORIES` is a power-user override for category bundles.

TODO: verify npm org/package availability for `auto-mcp` before publish.
