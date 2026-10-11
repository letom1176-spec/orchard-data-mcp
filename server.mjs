#!/usr/bin/env node
// orchard-data MCP server: exposes the paid x402 market-data API as MCP tools.
// Each paid tool call signs a USDC micro-payment (Base) with the wallet in
// EVM_PRIVATE_KEY and returns the JSON. Without a key, paid tools say what they
// would cost and make no request at all.
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const { version: VERSION } = createRequire(import.meta.url)("./package.json");
const BASE = process.env.ORCHARD_BASE_URL || "https://orchard-data.letom1176.workers.dev";
const NETWORK = "eip155:8453"; // Base mainnet
const TIMEOUT_MS = Number(process.env.ORCHARD_TIMEOUT_MS) || 30_000;

// Every price lives here and nowhere else in this file: tool descriptions,
// titles and the no-wallet message are all derived from it.
const FREE_TOOLS = [
  ["list_products", "Product manifest", "/", "Every orchard-data endpoint with its live price. Start here."],
  ["get_feed_status", "Feed freshness", "/api/feed-status", "Freshness probe for the rig-fed products (regime forecast, catalyst radar, track record): the age of each data feed, so you can verify freshness before spending on a paid call."],
  ["get_fear_greed", "Crypto fear & greed", "/api/fear-greed", "Crypto fear & greed index, current + previous reading."],
];

const symbol = z.string().describe("Ticker, e.g. SPY, NVDA");
const PAID_TOOLS = [
  {
    name: "run_backtest", title: "Backtest an entry rule", price: 0.1,
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
    name: "get_ohlcv", title: "Daily OHLCV", price: 0.002,
    description: "Daily OHLCV candles for any US symbol. range: 5d|1mo|3mo|6mo|1y.",
    inputSchema: { symbol, range: z.enum(["5d", "1mo", "3mo", "6mo", "1y"]).optional() },
    path: ({ symbol, range }) => `/api/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range || "1mo"}`,
  },
];

// $0.10 not $0.1; sub-cent prices keep their digits ($0.005).
const usd = (n) => `$${n >= 0.01 ? n.toFixed(2) : String(n)}`;
const prices = PAID_TOOLS.map((t) => t.price);
const PRICE_RANGE = `${usd(Math.min(...prices))}–${usd(Math.max(...prices))}`;
const FREE_NAMES = FREE_TOOLS.map(([name]) => name).join(", ");

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

// fetch() reports a refused connection as "fetch failed" and keeps the useful
// part (ECONNREFUSED, ENOTFOUND, ...) on `cause`.
function reason(e) {
  if (e?.name === "TimeoutError") return `no response within ${TIMEOUT_MS / 1000}s`;
  return e?.cause?.code || e?.cause?.message || e?.message || String(e);
}

const get = (f, path) =>
  f(`${BASE}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });

async function callFree(path) {
  try {
    const res = await get(fetch, path);
    const body = await res.text();
    if (!res.ok) {
      const retry = res.status === 429 || res.status >= 500 ? " Retry shortly." : "";
      return fail(`orchard-data API returned HTTP ${res.status} for ${path}: ${body.slice(0, 300)}\nThis tool is free, so nothing was charged.${retry}`);
    }
    return ok(body);
  } catch (e) {
    return fail(`Could not reach the orchard-data API at ${BASE} for ${path} (${reason(e)}). This tool is free, so nothing was charged.`);
  }
}

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base, 6 decimals

let wallet = null; // { account, fetchMod, ExactEvmScheme } once loaded, or { error } if the key is unusable
async function getWallet() {
  if (wallet) return wallet;
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) return null;
  const [fetchMod, { ExactEvmScheme }, { privateKeyToAccount }] =
    await Promise.all([import("@x402/fetch"), import("@x402/evm"), import("viem/accounts")]);
  try {
    wallet = { account: privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`), fetchMod, ExactEvmScheme };
  } catch {
    // Deliberately drop the parser's message: this text reaches the model's
    // context, and nothing derived from the key belongs there.
    wallet = { error: "EVM_PRIVATE_KEY is set but is not a valid private key (expected 64 hex characters, optionally 0x-prefixed). Fix it in this server's MCP config and restart. Nothing was charged." };
  }
  return wallet;
}

// Only sign what the tool advertises: USDC on Base, at or under its listed
// price. Without this the client signs whatever amount the server names, so a
// bad deploy or a mistyped ORCHARD_BASE_URL could charge any sum.
function withinPrice(req, price) {
  try {
    const units = BigInt(req.amount ?? req.maxAmountRequired);
    return req.network === NETWORK && String(req.asset).toLowerCase() === USDC_BASE && units <= BigInt(Math.round(price * 1e6));
  } catch {
    return false;
  }
}

function describeAsk(req) {
  const units = req.amount ?? req.maxAmountRequired;
  if (units == null) return `an unspecified amount of ${req.asset} on ${req.network}`;
  return String(req.asset).toLowerCase() === USDC_BASE && req.network === NETWORK
    ? `${usd(Number(units) / 1e6)} USDC`
    : `${units} units of ${req.asset} on ${req.network}`;
}

const noWallet = (name, price) => `${name} costs ${usd(price)} per call, paid in USDC on Base via x402. No wallet is configured, so no request was made and nothing was charged.

To enable paid tools:
1. Create a dedicated burner wallet on Base — never your main one — and fund it with a few dollars of USDC. Calls cost ${PRICE_RANGE}.
2. Set EVM_PRIVATE_KEY to that wallet's private key in this server's MCP config.
3. Restart the MCP server.

These tools are free and need no wallet: ${FREE_NAMES}.`;

async function callPaid(name, price, path) {
  const w = await getWallet();
  if (!w) return fail(noWallet(name, price));
  if (w.error) return fail(w.error);

  const asked = [];
  let signed = false;
  const client = w.fetchMod.x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new w.ExactEvmScheme(w.account) }],
    policies: [(_v, reqs) => (asked.push(...reqs), reqs.filter((r) => withinPrice(r, price)))],
  });
  client.onAfterPaymentCreation(async () => { signed = true; });
  const payFetch = w.fetchMod.wrapFetchWithPayment(fetch, client);
  const from = w.account.address;

  try {
    const res = await get(payFetch, path);
    const body = await res.text();
    if (res.status === 402) {
      return fail(`Payment for ${name} (${usd(price)}) was not accepted, so nothing was charged. Wallet ${from} most likely holds too little USDC on Base. Server said: ${body.slice(0, 300)}`);
    }
    if (!res.ok) {
      const charged = signed ? `A ${usd(price)} payment was signed for this request; check wallet ${from} before retrying.` : "No payment was signed.";
      return fail(`orchard-data API returned HTTP ${res.status} for ${name}: ${body.slice(0, 300)}\n${charged}`);
    }
    return ok(body);
  } catch (e) {
    if (!signed && asked.length && !asked.some((r) => withinPrice(r, price))) {
      return fail(`Refused to pay for ${name}: the server asked for ${asked.map(describeAsk).join(" or ")}, but this tool is listed at ${usd(price)} USDC on Base. No payment was signed. If prices changed, update orchard-data-mcp.`);
    }
    if (!signed) return fail(`${name} failed before any payment was signed (${reason(e)}). Nothing was charged; safe to retry.`);
    // The request died after a payment was signed, so it may settle. A blind
    // retry could pay twice; say so instead of inviting one.
    return fail(`${name} failed after a ${usd(price)} payment was signed (${reason(e)}). It may have settled; check wallet ${from} on Base before retrying.`);
  }
}

const server = new McpServer({ name: "orchard-data", version: VERSION });

for (const [name, title, path, description] of FREE_TOOLS) {
  server.registerTool(
    name,
    {
      title: `${title} (free)`,
      description: `FREE, no wallet needed. ${description}`,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    () => callFree(path),
  );
}

for (const { name, title, price, description, inputSchema, path } of PAID_TOOLS) {
  server.registerTool(
    name,
    {
      title: `${title} (${usd(price)})`,
      description: `${usd(price)}/call, paid automatically in USDC on Base via x402. ${description}`,
      ...(inputSchema ? { inputSchema } : {}),
      // Spending USDC changes the wallet, so these are not read-only, and every
      // call charges again, so they are not idempotent. Clients use these hints
      // to decide when to ask the user before calling.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (args) => callPaid(name, price, typeof path === "function" ? path(args) : path),
  );
}

await server.connect(new StdioServerTransport());
