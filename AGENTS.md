# Agent Instructions

- Keep this repo client-facing. Do not document Auto-internal routes, providers, or server implementation details in skill cards.
- Use binary API key language only: Read, Read + Write, Legacy - no MCP access.
- Prefer `AUTO_MCP_SURFACE` in examples. Mention `AUTO_MCP_CATEGORIES` only as a power-user override.
- Trading tools are wallet-native and must not be described as x402-paid tools.
- Paid data tools may be x402-paid; receipts decide whether a charge happened.
- The npm package lives in `packages/mcp` and is a thin stdio proxy only.
- Do not commit from this repo during agent work unless explicitly asked.
