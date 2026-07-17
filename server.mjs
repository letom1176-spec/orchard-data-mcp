#!/usr/bin/env node
// orchard-data MCP server: exposes the paid x402 market-data API as MCP tools.
// Each paid tool call signs a USDC micro-payment (Base) with the wallet in
// EVM_PRIVATE_KEY and returns the JSON. Without a key, paid tools return
// clear setup instructions instead of failing cryptically.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.ORCHARD_BASE_URL || "https://orchard-data.letom1176.workers.dev";
const NETWORK = "eip155:8453"; // Base mainnet

let payFetch = null;
let walletAddress = null;
async function getPayFetch() {
  if (payFetch) return payFetch;
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) return null;
  const [{ wrapFetchWithPaymentFromConfig }, { ExactEvmScheme }, { privateKeyToAccount }] =
    await Promise.all([import("@x402/fetch"), import("@x402/evm"), import("viem/accounts")]);
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  walletAddress = account.address;
  payFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  });
  return payFetch;
}

const NO_KEY_MSG = `No payment wallet configured. Paid tools need a Base wallet holding a little USDC:
1. Set env var EVM_PRIVATE_KEY to a Base wallet private key (0x...). Use a small dedicated wallet, NOT your main one.
2. Fund it with USDC on Base (each call costs $0.001-0.01).
3. Restart the MCP server.
The free tool list_products works without a key.`;

async function callPaid(path) {
  const f = await getPayFetch();
  if (!f) return { content: [{ type: "text", text: NO_KEY_MSG }], isError: true };
  try {
    const res = await f(`${BASE}${path}`, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (res.status !== 200) {
      return {
        content: [{ type: "text", text: `HTTP ${res.status} from ${path} (wallet ${walletAddress}). Body: ${text.slice(0, 600)}\nMost common cause: the wallet has no USDC on Base.` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Payment/call failed for ${path}: ${String(e?.message || e).slice(0, 500)}` }], isError: true };
  }
}

const server = new McpServer({ name: "orchard-data", version: "1.1.0" });

server.registerTool(
  "list_products",
  { description: "FREE: list all orchard-data market-data endpoints with prices (x402/USDC on Base)." },
  async () => {
    const res = await fetch(`${BASE}/`, { headers: { Accept: "application/json" } });
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

const paidTools = [
  ["get_regime_forecast", "/api/regime-forecast", "US market regime read ($0.01): ML volatility-regime forecast from a live trading system (when fresh, with 'why') + transparent rules-based snapshot (VIX bands, realized-vol percentile, trend). Best single call for 'what kind of market is this?'"],
  ["get_catalyst_radar", "/api/catalyst-radar", "Tickers with fresh bullish news catalysts ($0.01), from an AI news scanner feeding a live trading system. Refreshed ~15min during US market hours."],
  ["get_market_brief", "/api/market-brief", "One-call market snapshot ($0.005): BTC/ETH/SOL spot + 24h change, crypto fear & greed, SPY/QQQ/IWM/VIX quotes."],
  ["get_trending", "/api/trending", "Trending tickers ($0.005): StockTwits trending symbols + r/wallstreetbets mention counts with 24h momentum."],
  ["get_movers", "/api/movers", "Top trending US tickers with live quotes ($0.005), sorted by absolute move."],
  ["get_macro", "/api/macro", "Macro dashboard ($0.003): 13w/5y/10y/30y Treasury yields, dollar index, gold, WTI crude, VIX."],
  ["get_fear_greed", "/api/fear-greed", "Crypto fear & greed index ($0.001), current + previous reading."],
  ["get_track_record", "/api/track-record", "Live-verified trading-system track record ($0.01): normalized per-lane win rates, system-vs-SPY multiples, and a server-side scored forecast ledger (fixed disclosed rule vs realized SPY moves — grows daily, can't be faked)."],
  ["get_funding_rates", "/api/funding-rates", "Perp funding rates ($0.003): BTC/ETH/SOL from OKX — crowded-side gauge for crypto positioning."],
];

for (const [name, path, description] of paidTools) {
  server.registerTool(name, { description }, async () => callPaid(path));
}

server.registerTool(
  "get_ohlcv",
  {
    description: "Daily OHLCV candles for any US symbol ($0.002). range: 5d|1mo|3mo|6mo|1y.",
    inputSchema: { symbol: z.string().describe("Ticker, e.g. SPY, NVDA"), range: z.enum(["5d", "1mo", "3mo", "6mo", "1y"]).optional() },
  },
  async ({ symbol, range }) =>
    callPaid(`/api/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range || "1mo"}`),
);

server.registerTool(
  "get_expected_move",
  {
    description: "Options-implied expected move for a US symbol ($0.005): nearest-expiry ATM straddle mid as a % of spot.",
    inputSchema: { symbol: z.string().describe("Ticker, e.g. SPY, NVDA") },
  },
  async ({ symbol }) => callPaid(`/api/expected-move?symbol=${encodeURIComponent(symbol)}`),
);

const transport = new StdioServerTransport();
await server.connect(transport);
