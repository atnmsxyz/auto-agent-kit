# API Keys

Auto MCP keys are binary.

| Preset | Use | Can write? |
|---|---|---|
| Read | research, portfolio reads, market context | No |
| Read + Write | agents allowed to place trades | Yes, no withdrawals |
| Legacy - no MCP access | old keys with no stored MCP scopes | No |

Stored scopes are the enforcement truth. The UI badge is derived from scopes: any write scope shows Read + Write, read scopes show Read, no MCP scopes show Legacy.

Consent copy:

- "Paid data tools charge small USDC amounts from your Auto wallet per call."
- Read + Write also says: "This key can place trades from your connected wallet. No withdrawals."

Old preset IDs may appear in historical records as aliases: `research_only` and `trading_read_only` map to Read; `perps_trader_beta` and `full_trading_beta` map to Read + Write. New UI and docs should show only Read or Read + Write.

Revoke a key from the profile menu -> Account modal -> Account tab -> API Keys section when an agent no longer needs access. Revoked keys return 401 on the next call.

## If a key leaks

Revoke it. Revocation is immediate: the next call returns 401.

A leaked key can only use its MCP scopes. Writes are only possible through the MCP gateway. A leaked API key cannot call wallet-mutating REST routes and cannot withdraw or transfer funds.
