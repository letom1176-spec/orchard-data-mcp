---
name: market-data
description: |
  Live market data for agents over x402 (USDC on Base), mostly $0.001-0.005 per call: crypto fear & greed, perp funding for any Hyperliquid market, token safety checks, gas, trending coins, Polymarket odds, stock quotes, VIX, yields, commodities, FX, and news catalysts. No account or API key. A call that fails is never charged.

  USE FOR:
  - Crypto sentiment (fear & greed now or over 30 days, trending coins, WSB/StockTwits attention)
  - Perp funding rates and their recent history for any coin
  - Checking an EVM token for honeypot, taxes and liquidity before buying
  - Current stock/ETF prices, VIX, Treasury yields, gold/oil/dollar, FX rates
  - Prediction-market odds for news events
  - A one-call market or sentiment briefing

  TRIGGERS:
  - "fear and greed", "crypto sentiment", "market mood", "is the market greedy"
  - "funding rate", "perp funding", "longs paying shorts"
  - "is this token safe", "honeypot", "rug check", "token tax"
  - "price of", "quote", "how is SPY doing", "VIX", "yields", "gold", "oil", "exchange rate"
  - "polymarket", "odds", "chance that", "prediction market"
  - "gas fees", "what's trending in crypto", "market brief"

  IMPORTANT: Use the exact URLs in the Quick Reference table. Never guess paths. To list everything: x402.discover_api_endpoints(url="https://orchard-data.letom1176.workers.dev")
mcp:
  - x402
---

# Market data on orchard-data (x402)

Pay-per-call market data at `https://orchard-data.letom1176.workers.dev`. Unpaid requests get HTTP 402 with the price; the x402 MCP pays and retries. **Payment settles only on success.** Every response lists its sources and their status. Informational data, not financial advice.

## Setup

See [rules/getting-started.md](rules/getting-started.md).

## Quick Reference

| Task | Endpoint | Price | Input |
|------|----------|-------|-------|
| Crypto fear & greed (now + previous) | `https://orchard-data.letom1176.workers.dev/api/fear-greed` | $0.001 | none |
| Fear & greed, last 30 days + trend | `https://orchard-data.letom1176.workers.dev/api/fear-greed-history` | $0.002 | none |
| Crowd-mood bundle (F&G + StockTwits + WSB + trending coins) | `https://orchard-data.letom1176.workers.dev/api/sentiment-brief` | $0.005 | none |
| Perp funding, any Hyperliquid market | `https://orchard-data.letom1176.workers.dev/api/funding-history` | $0.002 | `?symbol=BTC&hours=24` |
| EVM token safety | `https://orchard-data.letom1176.workers.dev/api/token-check` | $0.005 | `?address=0x...&chain=base` |
| Base + Ethereum gas, with USD costs | `https://orchard-data.letom1176.workers.dev/api/gas` | $0.001 | none |
| Trending coins (CoinGecko searches) | `https://orchard-data.letom1176.workers.dev/api/crypto-trending` | $0.002 | none |
| Total crypto market cap, BTC dominance | `https://orchard-data.letom1176.workers.dev/api/crypto-global` | $0.001 | none |
| Polymarket odds | `https://orchard-data.letom1176.workers.dev/api/prediction-markets` | $0.003 | `?q=keyword` (optional) |
| Stock or ETF quote | `https://orchard-data.letom1176.workers.dev/api/quote` | $0.002 | `?symbol=NVDA` |
| SPY / QQQ / DIA / IWM | `https://orchard-data.letom1176.workers.dev/api/etf-quotes` | $0.003 | none |
| VIX | `https://orchard-data.letom1176.workers.dev/api/vix` | $0.001 | none |
| Treasury yields | `https://orchard-data.letom1176.workers.dev/api/yields` | $0.002 | none |
| FX rates | `https://orchard-data.letom1176.workers.dev/api/fx-rates` | $0.001 | `?base=USD` |
| Market brief (crypto + ETFs + F&G) | `https://orchard-data.letom1176.workers.dev/api/market-brief` | $0.005 | none |
| News catalysts (bullish + bearish) | `https://orchard-data.letom1176.workers.dev/api/catalyst-radar` | $0.01 | none |

## Examples

```mcp
x402.fetch(url="https://orchard-data.letom1176.workers.dev/api/fear-greed")
```
Returns `crypto_fear_greed.value` (0-100), `classification`, `previous_value`.

```mcp
x402.fetch(url="https://orchard-data.letom1176.workers.dev/api/funding-history?symbol=ETH&hours=72")
```
Returns current funding (hourly, 8h, annualized), mark, open interest, and the window's average/min/max with the hourly history.

```mcp
x402.fetch(url="https://orchard-data.letom1176.workers.dev/api/token-check?address=0x532f27101965dd16442E59d40670FaF5eBB142E4&chain=base")
```
Returns `verdict` (`no_major_flags` / `caution` / `high_risk` / `avoid`), `red_flags`, `warnings`, the security scan and DEX liquidity. A clean result is not a guarantee.

```mcp
x402.fetch(url="https://orchard-data.letom1176.workers.dev/api/prediction-markets?q=fed")
```

## Errors

| Status | Meaning | Charged? |
|--------|---------|----------|
| 402 | Payment required (normal first response) | No |
| 400 | Bad or unknown input (e.g. unknown perp symbol) | No |
| 502 / 503 | Every upstream source failed; retry shortly | No |
