# API Keys

Auto MCP keys are binary.

Use the interactive wizard so the key never needs to be copied into chat or an
MCP client configuration:

```bash
npx -y @atnms/auto-cli@latest setup
```

| Preset | Use | Can write? |
|---|---|---|
| Read | research, portfolio reads, market context | No |
| Read + Write | agents allowed to place trades | Yes, no withdrawals |
| Legacy - no MCP access | old keys with no stored MCP scopes | No |

Stored scopes are the enforcement truth. The UI badge is derived from scopes: any write scope shows Read + Write, read scopes show Read, no MCP scopes show Legacy.

The selected Research, Perps trading, Full trading, or Advanced custom tool set
is a separate visibility control. Surfaces and categories cannot upgrade a Read
key to Read + Write.

Consent copy:

- "Paid data tools charge small USDC amounts from your Auto wallet per call."
- Read + Write also says: "This key can place trades from your connected wallet. No withdrawals."

Old preset IDs may appear in historical records as aliases: `research_only` and `trading_read_only` map to Read; `perps_trader_beta` and `full_trading_beta` map to Read + Write. New UI and docs should show only Read or Read + Write.

Revoke a key from the profile menu -> Account modal -> Account tab -> API Keys section when an agent no longer needs access. Revoked keys return 401 on the next call.

The wizard stores generated credentials in `~/.auto/mcp/profiles.json` with
owner-only permissions. Client configurations receive only
`AUTO_MCP_PROFILE=<name>`. Use manual key creation only when browser handoff is
unavailable, and never paste a key into an LLM conversation.

## If a key leaks

Revoke it. Revocation is immediate: the next call returns 401.

A leaked key can only use its MCP scopes. Writes are only possible through the MCP gateway. A leaked API key cannot call wallet-mutating REST routes and cannot withdraw or transfer funds.
