# orchard-data-mcp

MCP server for [orchard-data](https://orchard-data.letom1176.workers.dev) — pay-per-call
market data for AI agents over [x402](https://x402.org) (USDC micro-payments on Base).

**The flagship tools are unique data**: an ML market-regime forecast, a news
catalyst radar, and a **live-verified track record** produced by a real
algorithmic trading system (the model actually trades), refreshed ~15 min
during US market hours, staleness always reported.

## Tools

| Tool | Price/call | What |
|---|---|---|
| `list_products` | free | Product manifest |
| `get_regime_forecast` ⭐ | $0.01 | ML vol-regime forecast + transparent rules snapshot |
| `get_track_record` ⭐ | $0.01 | Live-verified system record + server-side scored forecast ledger |
| `get_catalyst_radar` ⭐ | $0.01 | Tickers with fresh bullish news catalysts |
| `get_market_brief` | $0.005 | BTC/ETH/SOL + SPY/QQQ/IWM/VIX + fear&greed |
| `get_trending` | $0.005 | StockTwits + WSB mentions |
| `get_movers` | $0.005 | Trending tickers w/ live quotes |
| `get_expected_move` | $0.005 | Options-implied expected move (ATM straddle) for any symbol |
| `get_macro` | $0.003 | Yields, DXY, gold, oil, VIX |
| `get_funding_rates` | $0.003 | BTC/ETH/SOL perp funding (OKX) |
| `get_ohlcv` | $0.002 | Daily candles, any symbol |
| `get_fear_greed` | $0.001 | Crypto fear & greed |

## Setup

Payments need a small dedicated Base wallet holding USDC (a few dollars goes a
long way at these prices). **Use a burner wallet, never your main one.**

```json
{
  "mcpServers": {
    "orchard-data": {
      "command": "npx",
      "args": ["-y", "orchard-data-mcp"],
      "env": { "EVM_PRIVATE_KEY": "0x<burner wallet private key>" }
    }
  }
}
```

Without `EVM_PRIVATE_KEY`, `list_products` still works and paid tools explain setup.

## How payment works

Each paid tool call: GET → HTTP 402 (payment requirements) → the server signs a
USDC transfer authorization with your key → retries → JSON. Settlement is
gasless for the buyer (EIP-3009 via the x402 facilitator). No account, no API key.
