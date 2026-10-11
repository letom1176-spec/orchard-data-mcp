// Offline suite: drives server.mjs over real MCP stdio against a local stub of
// the orchard-data API, including real x402 signing with a throwaway key.
// Nothing here touches the network or a real wallet. `npm run test:live` is the
// smoke test against the production API.
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SERVER = new URL("./server.mjs", import.meta.url).pathname;

// ---- stub API -------------------------------------------------------------
// Per-test behavior lives in `stub`; reset before each case.
let stub;
const reset = () => (stub = { requests: [], signatures: [], free: {}, ask: null, afterPay: "ok", beforePay: null });

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://stub");
  stub.requests.push(url.pathname + url.search);

  const freeBodies = { "/": { endpoints: [{ path: "/api/x" }] }, "/api/feed-status": { feeds: { regime: 60 } }, "/api/fear-greed": { value: 42 } };
  if (url.pathname in freeBodies) {
    const mode = stub.free[url.pathname];
    if (mode === "hang") return;
    if (typeof mode === "number") return json(res, mode, { error: "upstream unavailable" });
    return json(res, 200, freeBodies[url.pathname]);
  }

  // Paid route: x402 v2. Ask for `stub.ask` (or the price implied by the
  // route), then accept any signature and record what was signed.
  if (stub.beforePay) return json(res, stub.beforePay, { error: "boom" });
  const sig = req.headers["payment-signature"];
  if (!sig) {
    const ask = { scheme: "exact", network: "eip155:8453", asset: USDC, payTo: "0x000000000000000000000000000000000000dEaD", amount: "10000", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" }, ...stub.ask?.(url.pathname) };
    const required = { x402Version: 2, resource: { url: req.url, description: "stub", mimeType: "application/json" }, accepts: [ask] };
    return json(res, 402, {}, { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(required)).toString("base64") });
  }
  const signed = JSON.parse(Buffer.from(sig, "base64").toString());
  stub.signatures.push(signed.payload.authorization);
  if (stub.afterPay === "hang") return;
  if (stub.afterPay === "reject") return json(res, 402, { error: "insufficient_funds" });
  return json(res, 200, { paid: url.pathname });
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${api.address().port}`;

// ---- harness --------------------------------------------------------------
async function withServer(env, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH, ORCHARD_BASE_URL: BASE, ...env } });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}
const call = (c, name, args = {}) => c.callTool({ name, arguments: args });
const text = (r) => r.content[0].text;

let passed = 0;
async function test(name, fn) {
  reset();
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message.split("\n").join("\n     ")}`); process.exitCode = 1; }
}

const KEY = generatePrivateKey();
const ADDR = privateKeyToAccount(KEY).address;
const FREE = ["list_products", "get_feed_status", "get_fear_greed"];

// ---- metadata -------------------------------------------------------------
let tools;
await test("lists all tools with price-tagged descriptions and honest annotations", () => withServer({}, async (c) => {
  ({ tools } = await c.listTools());
  assert.equal(tools.length, 16);
  for (const t of tools) {
    if (FREE.includes(t.name)) {
      assert.match(t.description, /^FREE, no wallet needed\./, t.name);
      assert.equal(t.annotations.readOnlyHint, true, `${t.name} is free and read-only`);
    } else {
      assert.match(t.description, /^\$[\d.]+\/call/, t.name);
      // Paid calls spend USDC: not read-only, and each call charges again.
      assert.equal(t.annotations.readOnlyHint, false, `${t.name} spends money`);
      assert.equal(t.annotations.idempotentHint, false, `${t.name} charges per call`);
    }
  }
}));

await test("versions agree across package.json, server.json and the running server", () => withServer({}, async (c) => {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
  const reg = JSON.parse(readFileSync(new URL("./server.json", import.meta.url)));
  assert.equal(c.getServerVersion().version, pkg.version);
  assert.equal(reg.version, pkg.version);
  assert.equal(reg.packages[0].version, pkg.version);
}));

await test("README price table matches what the server charges, tool for tool", async () => {
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  const listed = new Map([...readme.matchAll(/^\| `(\w+)`[^|]*\| (\*\*free\*\*|\$[\d.]+) \|/gm)].map(([, n, p]) => [n, p === "**free**" ? "free" : p]));
  for (const t of tools) {
    const actual = FREE.includes(t.name) ? "free" : t.description.match(/^(\$[\d.]+)\//)[1];
    assert.equal(listed.get(t.name), actual, `README lists ${t.name} as ${listed.get(t.name) ?? "missing"}, server charges ${actual}`);
  }
  assert.equal(listed.size, tools.length, "README lists a tool the server does not have");
});

// ---- free path ------------------------------------------------------------
await test("every free tool works with no wallet configured", () => withServer({}, async (c) => {
  for (const name of FREE) {
    const r = await call(c, name);
    assert.ok(!r.isError, `${name}: ${text(r)}`);
    JSON.parse(text(r));
  }
}));

await test("an API error on a free tool is reported as an error, not as data", () => withServer({}, async (c) => {
  stub.free["/api/fear-greed"] = 503;
  const r = await call(c, "get_fear_greed");
  assert.equal(r.isError, true);
  assert.match(text(r), /HTTP 503/);
  assert.match(text(r), /nothing was charged/);
}));

// Bind then release a port, so nothing is listening on it.
const closed = http.createServer();
await new Promise((r) => closed.listen(0, "127.0.0.1", r));
const DEAD = `http://127.0.0.1:${closed.address().port}`;
await new Promise((r) => closed.close(r));

await test("an unreachable API names the host and the cause", () => withServer({ ORCHARD_BASE_URL: DEAD }, async (c) => {
  const r = await call(c, "get_feed_status");
  assert.equal(r.isError, true);
  assert.ok(text(r).includes(DEAD), text(r));
  assert.match(text(r), /ECONNREFUSED/);
}));

await test("a hung API times out instead of hanging the agent", () => withServer({ ORCHARD_TIMEOUT_MS: "300" }, async (c) => {
  stub.free["/api/feed-status"] = "hang";
  const t0 = Date.now();
  const r = await call(c, "get_feed_status");
  assert.equal(r.isError, true);
  assert.match(text(r), /no response within 0\.3s/);
  assert.ok(Date.now() - t0 < 3000, "timeout did not fire");
}));

// ---- paid path, no wallet -------------------------------------------------
await test("a paid tool with no wallet states its own price and makes no request", () => withServer({}, async (c) => {
  const r = await call(c, "run_backtest", { symbol: "SPY", entry: "rsi2_below", threshold: 10 });
  assert.equal(r.isError, true);
  assert.match(text(r), /run_backtest costs \$0\.10 per call/);
  assert.match(text(r), /\$0\.002–\$0\.10/);
  for (const name of FREE) assert.ok(text(r).includes(name), `no-wallet message omits free tool ${name}`);
  assert.deepEqual(stub.requests, []);
}));

await test("a malformed key is explained without echoing any of it", () => withServer({ EVM_PRIVATE_KEY: "0xnotakeyTOPSECRET" }, async (c) => {
  const r = await call(c, "get_regime_forecast");
  assert.equal(r.isError, true);
  assert.match(text(r), /EVM_PRIVATE_KEY is set but is not a valid private key/);
  assert.ok(!text(r).includes("TOPSECRET"), "key material leaked into the tool result");
  assert.deepEqual(stub.requests, []);
}));

// ---- paid path, real signing ----------------------------------------------
await test("a paid call signs exactly the listed price from the configured wallet", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  const r = await call(c, "get_regime_forecast");
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)), { paid: "/api/regime-forecast" });
  assert.equal(stub.signatures.length, 1);
  assert.equal(stub.signatures[0].from, ADDR);
  assert.equal(stub.signatures[0].value, "10000"); // $0.01 in 6-decimal USDC
}));

await test("tool arguments reach the API as query parameters", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  stub.ask = () => ({ amount: "100000" });
  const r = await call(c, "run_backtest", { symbol: "NVDA", entry: "ibs_below", threshold: 0.15, hold_days: 3 });
  assert.ok(!r.isError, text(r));
  assert.equal(stub.requests.at(-1), "/api/backtest?symbol=NVDA&entry=ibs_below&threshold=0.15&hold_days=3");
}));

await test("refuses to sign when the server asks more than the listed price", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  stub.ask = () => ({ amount: "50000000" }); // $50 for a $0.01 tool
  const r = await call(c, "get_regime_forecast");
  assert.equal(r.isError, true);
  assert.match(text(r), /Refused to pay for get_regime_forecast: the server asked for \$50\.00 USDC/);
  assert.match(text(r), /No payment was signed/);
  assert.equal(stub.signatures.length, 0, "an overpriced payment was signed");
}));

await test("refuses to sign for any asset other than USDC on Base", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  stub.ask = () => ({ asset: "0x1111111111111111111111111111111111111111" });
  const r = await call(c, "get_macro");
  assert.equal(r.isError, true);
  assert.match(text(r), /Refused to pay/);
  assert.equal(stub.signatures.length, 0);
}));

await test("a rejected payment says nothing was charged and names the wallet", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  stub.afterPay = "reject";
  const r = await call(c, "get_regime_forecast");
  assert.equal(r.isError, true);
  assert.match(text(r), /was not accepted, so nothing was charged/);
  assert.ok(text(r).includes(ADDR));
}));

await test("a server error before payment says no payment was signed", () => withServer({ EVM_PRIVATE_KEY: KEY }, async (c) => {
  stub.beforePay = 500;
  const r = await call(c, "get_regime_forecast");
  assert.equal(r.isError, true);
  assert.match(text(r), /HTTP 500/);
  assert.match(text(r), /No payment was signed/);
  assert.equal(stub.signatures.length, 0);
}));

await test("a timeout after signing warns against a blind retry", () => withServer({ EVM_PRIVATE_KEY: KEY, ORCHARD_TIMEOUT_MS: "500" }, async (c) => {
  stub.afterPay = "hang";
  const r = await call(c, "get_regime_forecast");
  assert.equal(r.isError, true);
  assert.equal(stub.signatures.length, 1);
  assert.match(text(r), /failed after a \$0\.01 payment was signed/);
  assert.match(text(r), /check wallet .* before retrying/);
}));

api.close();
api.closeAllConnections();
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
