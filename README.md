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

Two tools work immediately with no wallet configured:

| Free tool | What you get |
|---|---|
| `list_products` | Every endpoint with its live price |
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
| `get_feed_status` | **free** | Freshness probe — check the rig-fed products are current *before* paying |
| `run_backtest` ⭐ | $0.10 | Backtest your own entry rule on up to 10y of real daily bars: next-open fills (no look-ahead), slippage charged, train/test halves scored apart, buy&hold + SPY baselines always printed, disagreeing halves reported as noise |
| `get_symbol_dossier` | $0.02 | One ticker, one call: quote + 1y technicals + expected move + regime + news catalysts. Replaces ~6 calls, priced below their sum |
| `get_regime_forecast` ⭐ | $0.01 | ML volatility-regime forecast + a transparent rules-based read (VIX bands, realized-vol percentile, trend) |
| `get_track_record` ⭐ | $0.01 | Normalized per-lane win rates + the server-side scored forecast ledger. Audit us before buying anything else |
| `get_catalyst_radar` ⭐ | $0.01 | Tickers with a fresh news catalyst (bullish + bearish) and the headline behind it: the trading system's AI scanner, or a disclosed 12h headline scan when it is idle |
| `get_dip_radar` ⭐ | $0.01 | Live dip scan over the exact 55-name book the trading system runs: RSI(2), distance from the 20-day high, tiered dip flags under disclosed thresholds |
| `get_market_brief` | $0.005 | BTC/ETH/SOL + SPY/QQQ/DIA/IWM + crypto fear & greed, one call |
| `get_trending` | $0.005 | StockTwits trending + r/wallstreetbets mention counts |
| `get_movers` | $0.005 | Biggest US movers with live quotes, sorted by absolute move |
| `get_expected_move` | $0.005 | Options-implied expected move (ATM straddle to nearest expiry), any symbol |
| `get_macro` | $0.003 | Treasury yields (13w/5y/10y/30y), dollar index, gold, WTI crude, VIX |
| `get_funding_rates` | $0.003 | BTC/ETH/SOL perp funding (8h + annualized), next funding time, mark price |
| `get_fear_greed` | $0.001 | Crypto fear & greed index, current + previous reading |
| `get_ohlcv` | $0.002 | Daily OHLCV candles, any US symbol, 5d–1y |
| `read_web_page` | $0.001 | Any web page as clean markdown (title, date, text with links). Failed fetches are not charged |
| `verify_email` | $0.001 | Email check: syntax, MX, disposable, role account, SPF/DMARC, with verdict and score |
| `check_token` | $0.005 | EVM token safety: honeypot, taxes, owner powers, holder sell simulation, DEX liquidity, verdict |
| `get_sentiment_brief` | $0.005 | Crowd mood in one call: crypto fear & greed + StockTwits trending + WSB mentions + CoinGecko trending coins |
| `get_fear_greed_history` | $0.002 | Crypto fear & greed, last 30 days, with 7d/30d averages, trend and extreme-day counts |
| `get_stocktwits_trending` | $0.003 | StockTwits trending symbols with watchlist counts |
| `get_wsb_mentions` | $0.003 | r/wallstreetbets ticker mentions, ranked, vs 24h ago |
| `get_crypto_trending` | $0.002 | CoinGecko's most-searched coins (24h) with price and 24h change |
| `get_prediction_markets` | $0.003 | Live Polymarket odds for the most-traded open markets, optional keyword filter |
| `get_quote` | $0.002 | Live quote, any US symbol |
| `get_dip_check` | $0.003 | Is this symbol dipping? RSI(2)/RSI(14)/distance from 20-day high + verdict |
| `get_etf_quotes` | $0.003 | SPY/QQQ/DIA/IWM quotes in one call |
| `get_crypto_spot` | $0.003 | BTC/ETH/SOL spot + 24h change |
| `get_crypto_global` | $0.001 | Total crypto market cap, volume, BTC/ETH dominance |
| `get_yields` | $0.002 | Treasury yields: 13w/5y/10y/30y |
| `get_vix` | $0.001 | VIX now |
| `get_commodities` | $0.002 | Gold, WTI crude, dollar index |
| `get_fx_rates` | $0.001 | FX rates, ~30 currencies, any base |
| `get_gas` | $0.001 | Base + Ethereum gas now, with USD cost of a transfer and a swap |

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

Without `EVM_PRIVATE_KEY` the two free tools still work, and the paid tools
explain what they would cost rather than failing silently.

## How payment works

Each paid tool call: GET → HTTP 402 with payment requirements → the client signs
a USDC transfer authorization with your key → retries with the payment header →
JSON. Settlement is gasless for the buyer (EIP-3009 via the x402 facilitator).
Verified end-to-end on Base mainnet.

**The server can never charge more than the listed price.** Before signing, the
client checks the payment request against the tool's listed price — the one in
its description and in the table above, which the test suite keeps identical. It
must be USDC on Base, at or under that amount. Anything
else — a bad deploy, a changed price, a mistyped `ORCHARD_BASE_URL` — is refused
with no signature produced. A tool that is listed at $0.01 cannot cost you $1.

**Errors say whether you paid.** Every failure tells you whether a payment was
signed, so you know whether a retry is safe. If a request dies *after* signing,
the error says so and asks you to check the wallet before retrying, rather than
inviting a retry that could pay twice.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `EVM_PRIVATE_KEY` | unset | Burner Base wallet key. Unset = free tools only |
| `ORCHARD_TIMEOUT_MS` | `30000` | Per-call timeout, so a stalled API cannot hang your agent |
| `ORCHARD_BASE_URL` | production | Point at another deployment, e.g. for testing |

## Development

```bash
npm test          # offline: stub API, real MCP stdio, real x402 signing with a throwaway key
npm run test:live # check against the production API — free, needs no funds
```

The offline suite covers the paid path end to end — including refusing an
overpriced request — without touching the network or a real wallet. It also
fails if this README's price table drifts from what the server charges.

`test:live` costs nothing. It checks the paid path with a freshly generated
**empty** wallet: signing a payment authorization spends nothing, so production
must reject it, and that rejection proves production's payment request passes
the price cap. It ignores any `EVM_PRIVATE_KEY` in your environment, so it can
never touch a real wallet.
