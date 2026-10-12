// Live check against the production API. Costs nothing and needs no funds.
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

await session({}, async (c) => {
  for (const name of ["list_products", "get_feed_status", "get_fear_greed"]) {
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
