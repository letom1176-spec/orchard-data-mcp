# orchard-data-mcp

MCP server for [orchard-data](https://orchard-data.letom1176.workers.dev) — pay-per-call
market data for AI agents over [x402](https://x402.org) (USDC micro-payments on Base).
No account, no API key, no subscription.

## Try it in 10 seconds — no wallet, no signup

```bash
npx -y orchard-data-mcp
```

Add it to any MCP client with no credentials at all:

```json
{ "mcpServers": { "orchard-data": { "command": "npx", "args": ["-y", "orchard-data-mcp"] } } }
```

Three tools work immediately with no wallet configured:

| Free tool | What you get |
|---|---|
| `list_products` | Every endpoint with its live price |
| `get_fear_greed` | Crypto fear & greed, current + previous |
| `get_feed_status` | Age of each data feed — verify freshness *before* paying |

Ask your agent for `get_feed_status` first. If the feeds are stale, you have
learned that for free; nothing here hides staleness to sell you a call.

Paid tools cost $0.001–$0.10 and need a burner Base wallet with a few dollars of
USDC — [setup below](#paying-for-the-paid-tools). Without a key they explain what
they would cost instead of failing silently.

## What makes it worth paying for

**A track record you can audit.** Forecasts are timestamped *before* the outcome
and scored server-side against what actually happened, under a fixed rule shipped
inside the payload. Call `get_track_record` for $0.01 and check our accuracy
before you trust anything else we sell. Almost nothing in this category lets you
do that, because almost nothing in this category would survive it.

Plus an ML market-regime forecast and a news catalyst radar, produced by a real
algorithmic trading system — refreshed ~15 min during US market hours, staleness
always reported.

## Tools

| Tool | Price/call | What |
|---|---|---|
| `list_products` | **free** | Product manifest with live prices |
| `get_fear_greed` | **free** | Crypto fear & greed index, current + previous reading |
| `get_feed_status` | **free** | Freshness probe — check the rig-fed products are current *before* paying |
| `run_backtest` ⭐ | $0.10 | Backtest your own entry rule on up to 10y of real daily bars: next-open fills (no look-ahead), slippage charged, train/test halves scored apart, buy&hold + SPY baselines always printed, disagreeing halves reported as noise |
| `get_symbol_dossier` | $0.02 | One ticker, one call: quote + 1y technicals + expected move + regime + news catalysts. Replaces ~6 calls, priced below their sum |
| `get_regime_forecast` ⭐ | $0.01 | ML volatility-regime forecast + a transparent rules-based read (VIX bands, realized-vol percentile, trend) |
| `get_track_record` ⭐ | $0.01 | Normalized per-lane win rates + the server-side scored forecast ledger. Audit us before buying anything else |
| `get_catalyst_radar` ⭐ | $0.01 | Tickers with a fresh bullish news catalyst and why it matters — not scraped headlines |
| `get_dip_radar` ⭐ | $0.01 | Live dip scan over the exact 55-name book the trading system runs: RSI(2), distance from the 20-day high, tiered dip flags under disclosed thresholds |
| `get_market_brief` | $0.005 | BTC/ETH/SOL + SPY/QQQ/DIA/IWM + crypto fear & greed, one call |
| `get_trending` | $0.005 | StockTwits trending + r/wallstreetbets mention counts |
| `get_movers` | $0.005 | Biggest US movers with live quotes, sorted by absolute move |
| `get_expected_move` | $0.005 | Options-implied expected move (ATM straddle to nearest expiry), any symbol |
| `get_macro` | $0.003 | Treasury yields (13w/5y/10y/30y), dollar index, gold, WTI crude, VIX |
| `get_funding_rates` | $0.003 | BTC/ETH/SOL perp funding (8h + annualized), next funding time, mark price |
| `get_ohlcv` | $0.002 | Daily OHLCV candles, any US symbol, 5d–1y |

⭐ = unique to us, not repackaged vendor data.

The HTTP API carries more products than this server wraps — including narrow
slices like `/api/quote`, `/api/yields`, `/api/vix`, `/api/commodities`,
`/api/crypto-spot`, `/api/etf-quotes`, `/api/wsb-mentions` and
`/api/stocktwits-trending`, plus a free full-sample response at `/api/sample`.
See the [manifest](https://orchard-data.letom1176.workers.dev/) or
[openapi.json](https://orchard-data.letom1176.workers.dev/openapi.json).

## Paying for the paid tools

Paid tools need a small dedicated Base wallet holding USDC (a few dollars goes a
very long way at these prices). **Use a burner wallet, never your main one.**

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

Without `EVM_PRIVATE_KEY` the three free tools still work, and the paid tools
explain what they would cost rather than failing silently.

## How payment works

Each paid tool call: GET → HTTP 402 with payment requirements → the client signs
a USDC transfer authorization with your key → retries with the payment header →
JSON. Settlement is gasless for the buyer (EIP-3009 via the x402 facilitator).
Verified end-to-end on Base mainnet.
