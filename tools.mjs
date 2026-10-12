// The tool table: every name, endpoint and price, and nothing else. The server
// derives descriptions, titles and the no-wallet message from it; the offline
// suite checks the README against it; and `npm run test:live` checks it against
// what production actually charges. Change a price here and nowhere else.
import { z } from "zod";

export const FREE_TOOLS = [
  ["list_products", "Product manifest", "/", "Every orchard-data endpoint with its live price. Start here."],
  ["get_feed_status", "Feed freshness", "/api/feed-status", "Freshness probe for the rig-fed products (regime forecast, catalyst radar, track record): the age of each data feed, so you can verify freshness before spending on a paid call."],
];

const symbol = z.string().describe("Ticker, e.g. SPY, NVDA");
export const PAID_TOOLS = [
  {
    name: "run_backtest", title: "Backtest an entry rule", price: 0.1,
    sample: { symbol: "SPY", entry: "rsi2_below", threshold: 10 },
    description: "Honest backtest of an entry rule on up to 10y of real daily bars. No look-ahead (next-open fills), slippage charged, train/test halves scored separately, buy&hold + SPY baselines always printed, noise flagged as noise. Entry rules: rsi2_below, rsi14_below, ibs_below, dip_from_high20, down_days, sma_cross_up, gap_down.",
    inputSchema: {
      symbol,
      entry: z.enum(["rsi2_below", "rsi14_below", "ibs_below", "dip_from_high20", "down_days", "sma_cross_up", "gap_down"]),
      threshold: z.number().describe("Rule threshold, e.g. 10 for rsi2_below, 0.15 for ibs_below"),
      hold_days: z.number().optional().describe("Max hold in trading days (1-30), default 5"),
      stop_pct: z.number().optional().describe("Optional stop loss %"),
      target_pct: z.number().optional().describe("Optional profit target %"),
    },
    path: ({ symbol, entry, threshold, hold_days, stop_pct, target_pct }) => {
      const p = new URLSearchParams({ symbol, entry, threshold: String(threshold) });
      if (hold_days != null) p.set("hold_days", String(hold_days));
      if (stop_pct != null) p.set("stop_pct", String(stop_pct));
      if (target_pct != null) p.set("target_pct", String(target_pct));
      return `/api/backtest?${p}`;
    },
  },
  {
    name: "get_symbol_dossier", title: "Symbol dossier", price: 0.02,
    sample: { symbol: "SPY" },
    description: "One-call deep context on a US ticker: live quote, 1y technicals (trend, SMA distances, realized vol, 52w position, multi-horizon returns), options-implied expected move, market regime context, and news-catalyst hits from a live trading system's AI scanner. Replaces ~6 separate calls.",
    inputSchema: { symbol },
    path: ({ symbol }) => `/api/symbol-dossier?symbol=${encodeURIComponent(symbol)}`,
  },
  {
    name: "get_regime_forecast", title: "Regime forecast", price: 0.01, path: "/api/regime-forecast",
    description: "US market regime read: ML volatility-regime forecast with independently-scored accuracy — audit the ledger via get_track_record before you buy. From a live-forward trading system (~70% walk-forward vol accuracy; direction advisory only), plus a transparent rules-based snapshot (VIX bands, realized-vol percentile, trend). Best single call for 'what kind of market is this?'",
  },
  {
    name: "get_track_record", title: "Audited track record", price: 0.01, path: "/api/track-record",
    description: "Tamper-evident trading track record: forecasts timestamped BEFORE outcomes, scored server-side against realized SPY under a fixed rule disclosed in the payload — cannot be rewritten, re-checkable, grows daily. Plus normalized per-lane win rates and system-vs-SPY multiples. Use this to audit get_regime_forecast before relying on it.",
  },
  {
    name: "get_catalyst_radar", title: "Catalyst radar", price: 0.01, path: "/api/catalyst-radar",
    description: "Tickers with fresh bullish news catalysts — the AI news scanner feeding a live-forward trading system, not scraped headlines. Refreshed ~15min during US market hours; staleness always disclosed (probe get_feed_status free first).",
  },
  {
    name: "get_dip_radar", title: "Dip radar", price: 0.01, path: "/api/dip-radar",
    description: "Dip radar over the exact ~55-name universe a live-forward trading system trades: RSI(2), distance from 20-day high, 1d/5d returns for every name, each flagged deep_dip/dip/near_dip/none under fully disclosed thresholds. Computed fresh from real daily bars, refreshed <=15 min, works 24/7.",
  },
  {
    name: "get_market_brief", title: "Market brief", price: 0.005, path: "/api/market-brief",
    description: "One-call market snapshot: BTC/ETH/SOL spot + 24h change, crypto fear & greed, SPY/QQQ/IWM/VIX quotes.",
  },
  {
    name: "get_trending", title: "Trending tickers", price: 0.005, path: "/api/trending",
    description: "Trending tickers: StockTwits trending symbols + r/wallstreetbets mention counts with 24h momentum.",
  },
  {
    name: "get_movers", title: "Top movers", price: 0.005, path: "/api/movers",
    description: "Top trending US tickers with live quotes, sorted by absolute move.",
  },
  {
    name: "get_expected_move", title: "Expected move", price: 0.005,
    sample: { symbol: "SPY" },
    description: "Options-implied expected move for a US symbol: nearest-expiry ATM straddle mid as a % of spot.",
    inputSchema: { symbol },
    path: ({ symbol }) => `/api/expected-move?symbol=${encodeURIComponent(symbol)}`,
  },
  {
    name: "get_macro", title: "Macro dashboard", price: 0.003, path: "/api/macro",
    description: "Macro dashboard: 13w/5y/10y/30y Treasury yields, dollar index, gold, WTI crude, VIX.",
  },
  {
    name: "get_funding_rates", title: "Perp funding rates", price: 0.003, path: "/api/funding-rates",
    description: "Perp funding rates: BTC/ETH/SOL from OKX — crowded-side gauge for crypto positioning.",
  },
  {
    name: "get_fear_greed", title: "Crypto fear & greed", price: 0.001, path: "/api/fear-greed",
    description: "Crypto fear & greed index, current + previous reading.",
  },
  {
    name: "get_ohlcv", title: "Daily OHLCV", price: 0.002,
    sample: { symbol: "SPY" },
    description: "Daily OHLCV candles for any US symbol. range: 5d|1mo|3mo|6mo|1y.",
    inputSchema: { symbol, range: z.enum(["5d", "1mo", "3mo", "6mo", "1y"]).optional() },
    path: ({ symbol, range }) => `/api/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range || "1mo"}`,
  },
];
