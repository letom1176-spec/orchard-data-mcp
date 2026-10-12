// Live check against the production API. Costs nothing and needs no funds.
//
// Production is the only authority on prices, and the tool table has drifted
// from it before. So every paid endpoint is first asked, without payment, what
// it charges; a 402 answer states the exact amount, and that must equal the
// price in tools.mjs.
//
// The free tools are called with no wallet. The paid path is checked with a
// brand-new EMPTY wallet generated here and thrown away afterwards: signing a
// payment authorization spends nothing, and with no USDC behind it the API must
// reject it. That rejection proves production's payment request passes this
// client's price cap. Any EVM_PRIVATE_KEY in your environment is ignored, so
// this can never touch a real wallet.
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generatePrivateKey } from "viem/accounts";
import { FREE_TOOLS, PAID_TOOLS } from "./tools.mjs";

// fileURLToPath, not .pathname: on Windows .pathname is "/C:/..." and keeps
// %20 for spaces, so node would look for C:\C:\... and fail.
const SERVER = fileURLToPath(new URL("./server.mjs", import.meta.url));
let failed = false;
const check = (good, msg) => { console.log(`${good ? "ok  " : "FAIL"} ${msg}`); if (!good) failed = true; };

async function session(env, fn) {
  const { EVM_PRIVATE_KEY: _ignored, ...rest } = process.env;
  const client = new Client({ name: "live-check", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...rest, ...env } }));
  try { return await fn(client); } finally { await client.close(); }
}

const BASE = process.env.ORCHARD_BASE_URL || "https://orchard-data.letom1176.workers.dev";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const usd = (n) => `$${n >= 0.01 ? n.toFixed(2) : String(n)}`;

// What production asks for, unpaid. x402 v2 puts it base64-encoded in a
// PAYMENT-REQUIRED header; v1 puts it in the JSON body.
async function askedPrice(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  if (res.status !== 402) return { error: `HTTP ${res.status} instead of 402: ${body.slice(0, 120)}` };
  const header = res.headers.get("payment-required");
  const req = header ? JSON.parse(Buffer.from(header, "base64").toString()) : JSON.parse(body);
  const usdc = (req.accepts ?? []).find((a) => String(a.asset).toLowerCase() === USDC_BASE && ["eip155:8453", "base"].includes(a.network));
  if (!usdc) return { error: `no USDC-on-Base option in ${JSON.stringify(req.accepts).slice(0, 160)}` };
  return { units: Number(usdc.amount ?? usdc.maxAmountRequired), version: req.x402Version };
}

for (const { name, price, path, sample } of PAID_TOOLS) {
  const listed = Math.round(price * 1e6);
  try {
    const got = await askedPrice(typeof path === "function" ? path(sample) : path);
    if (got.error) check(false, `${name}: ${got.error}`);
    else if (got.units === listed) check(true, `${name} costs ${usd(price)}, as listed (x402 v${got.version})`);
    else check(false, `${name} is listed at ${usd(price)} but production charges ${usd(got.units / 1e6)}. Fix the price in tools.mjs.`);
  } catch (e) {
    check(false, `${name}: could not ask production its price (${e.message})`);
  }
}

await session({}, async (c) => {
  for (const [name] of FREE_TOOLS) {
    const r = await c.callTool({ name, arguments: {} });
    check(!r.isError, `${name} works with no wallet${r.isError ? `: ${r.content[0].text.slice(0, 200)}` : ""}`);
  }
});

await session({ EVM_PRIVATE_KEY: generatePrivateKey() }, async (c) => {
  const r = await c.callTool({ name: "get_regime_forecast", arguments: {} });
  const text = r.content[0].text;
  if (/was not accepted, so nothing was charged/.test(text)) {
    check(true, "paid path: production's payment request passes the price cap (empty wallet rejected, as expected)");
  } else if (/Refused to pay/.test(text)) {
    check(false, `paid path: production asks for something the price cap refuses. Paid tools will not work until this is fixed:\n     ${text}`);
  } else if (!r.isError) {
    check(false, "paid path: production served a paid tool to an empty wallet. Payment is not being enforced.");
  } else {
    check(false, `paid path: unexpected response:\n     ${text.slice(0, 400)}`);
  }
});

console.log(failed ? "\nSome checks FAILED." : "\nAll live checks passed. Nothing was charged.");
process.exitCode = failed ? 1 : 0;
