#!/usr/bin/env node
// orchard-data MCP server: exposes the paid x402 market-data API as MCP tools.
// Each paid tool call signs a USDC micro-payment (Base) with the wallet in
// EVM_PRIVATE_KEY and returns the JSON. Without a key, paid tools say what they
// would cost and make no request at all.
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FREE_TOOLS, PAID_TOOLS } from "./tools.mjs";

const { version: VERSION } = createRequire(import.meta.url)("./package.json");
const BASE = process.env.ORCHARD_BASE_URL || "https://orchard-data.letom1176.workers.dev";
const NETWORK = "eip155:8453"; // Base mainnet
const TIMEOUT_MS = Number(process.env.ORCHARD_TIMEOUT_MS) || 30_000;


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

function forSaleReason(body) {
  try {
    const j = JSON.parse(body);
    return j.for_sale === false ? String(j.reason ?? "the data is stale.") : null;
  } catch {
    return null;
  }
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
      // Rather than sell stale data, the API answers {"for_sale": false, "reason"}.
      const withheld = !signed && forSaleReason(body);
      if (withheld) return fail(`${name} is temporarily not for sale: ${withheld} No payment was signed and nothing was charged. Call get_feed_status (free) to see when feeds were last updated.`);
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
