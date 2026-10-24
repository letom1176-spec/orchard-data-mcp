# Getting Started

## Setup

1. **Install the x402 MCP** (gives your agent a USDC wallet that pays x402 endpoints):
   ```bash
   npx @x402scan/mcp install --client claude-code -y
   ```
   Other clients: see https://x402scan.com.

2. **Check the wallet:**
   ```mcp
   x402.get_wallet_info
   ```

3. **Fund it** with USDC on Base if needed (the deposit page is linked from `x402.get_wallet_info`). Most calls here cost $0.001-0.005, so $1 covers hundreds of calls.

4. **List every endpoint and price** on this server:
   ```mcp
   x402.discover_api_endpoints(url="https://orchard-data.letom1176.workers.dev")
   ```

## Alternative: the orchard-data MCP server

If you would rather have named tools than raw URLs:
```bash
npx -y orchard-data-mcp
```
Set `EVM_PRIVATE_KEY` to a burner wallet key holding a little USDC on Base. Without a key, the free tools work and paid tools state their price without making a request.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "MCP tool not found" | Run the install command, then restart your client |
| "Insufficient balance" | Fund the wallet with USDC on Base |
| 404 | Wrong path: copy the exact URL from the Quick Reference table |
| 503 on chat/ask | Today's model capacity is used up; nothing was charged, retry later |
