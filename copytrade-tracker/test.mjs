// Unit tests for swap extraction and the report's FIFO matching. No network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolve from this file, so the suite passes from any working directory.
const HERE = dirname(fileURLToPath(import.meta.url));
import { extractSwap, WSOL } from "./lib.mjs";

const W = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MINT = "M1ntAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const tx = ({ solBefore, solAfter, tokBefore, tokAfter, err = null, fee = 5000 }) => ({
  slot: 1, blockTime: 1700000000,
  transaction: { message: { accountKeys: [{ pubkey: W }] } },
  meta: {
    err, fee,
    preBalances: [solBefore * 1e9], postBalances: [solAfter * 1e9],
    preTokenBalances: tokBefore == null ? [] : [{ owner: W, mint: MINT, uiTokenAmount: { uiAmount: tokBefore } }],
    postTokenBalances: tokAfter == null ? [] : [{ owner: W, mint: MINT, uiTokenAmount: { uiAmount: tokAfter } }],
  },
});

// A buy: SOL out, tokens in.
const buy = extractSwap(tx({ solBefore: 10, solAfter: 9, tokBefore: 0, tokAfter: 1000 }), W);
assert.equal(buy.side, "buy");
// postBalances already have the fee deducted, so the swap leg is 1 SOL minus
// the 5000-lamport fee. Charging the fee to the trade size would overstate it.
assert.ok(Math.abs(buy.solAmount - 0.999995) < 1e-9, `fee must be excluded, got ${buy.solAmount}`);
assert.ok(Math.abs(buy.priceSol - 0.000999995) < 1e-12);

// A sell: tokens out, SOL in.
const sell = extractSwap(tx({ solBefore: 9, solAfter: 11, tokBefore: 1000, tokAfter: 0 }), W);
assert.equal(sell.side, "sell");
assert.ok(Math.abs(sell.solAmount - 2) < 1e-5);

// Failed transactions are not trades.
assert.equal(extractSwap(tx({ solBefore: 10, solAfter: 9, tokBefore: 0, tokAfter: 1000, err: { x: 1 } }), W), null);

// An airdrop moves tokens without moving SOL.
assert.equal(extractSwap(tx({ solBefore: 10, solAfter: 10, tokBefore: 0, tokAfter: 5000 }), W), null);

// Receiving both SOL and tokens is not a swap.
assert.equal(extractSwap(tx({ solBefore: 9, solAfter: 10, tokBefore: 0, tokAfter: 1000 }), W), null);

// Another wallet's balances in the same transaction must be ignored.
const foreign = tx({ solBefore: 10, solAfter: 9, tokBefore: 0, tokAfter: 1000 });
foreign.meta.postTokenBalances.push({ owner: "someoneElse", mint: "other", uiTokenAmount: { uiAmount: 99 } });
assert.equal(extractSwap(foreign, W).mint, MINT);

// Wrapped SOL counts as SOL, not as a second token leg.
const wrapped = tx({ solBefore: 10, solAfter: 10, tokBefore: 0, tokAfter: 1000, fee: 0 });
wrapped.meta.preTokenBalances.push({ owner: W, mint: WSOL, uiTokenAmount: { uiAmount: 1 } });
wrapped.meta.postTokenBalances.push({ owner: W, mint: WSOL, uiTokenAmount: { uiAmount: 0 } });
assert.equal(extractSwap(wrapped, W).side, "buy");

// End-to-end: a 2x round trip must still be reported as a LOSS once 3% slippage
// per leg and fees are charged, because that is the whole point of the tool.
const rows = [
  { ts: "2026-01-01T00:00:00Z", slot: 1, wallet: W, label: "t1", signature: "a", side: "buy", mint: MINT, tokenAmount: 1000, solAmount: 1, priceSol: 0.001 },
  { ts: "2026-01-01T01:00:00Z", slot: 2, wallet: W, label: "t1", signature: "b", side: "sell", mint: MINT, tokenAmount: 1000, solAmount: 1.05, priceSol: 0.00105 },
];
writeFileSync(join(HERE, "trades.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const out = execFileSync(process.execPath, [join(HERE, "report.mjs")], { cwd: HERE, encoding: "utf8", env: { ...process.env, SLIPPAGE_PCT: "3", FEE_SOL: "0.0006" } });
assert.match(out, /1 round trips/);
assert.match(out, /-0\.0/, `a +5% leader trade must show negative after costs:\n${out}`);
rmSync(join(HERE, "trades.jsonl"));

console.log("all tests passed");
console.log(out.trim().split("\n").slice(-4).join("\n"));
