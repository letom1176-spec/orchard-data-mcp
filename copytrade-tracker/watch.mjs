// Polls tracked wallets and appends every detected swap to trades.jsonl.
// Read-only: this process holds no key and can move no funds.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { rpc, extractSwap } from "./lib.mjs";

const CONFIG = process.env.CONFIG ?? "./config.json";
const TRADES = "./trades.jsonl";
const CURSORS = "./cursors.json";

if (!existsSync(CONFIG)) {
  console.error(`No ${CONFIG}. Copy config.example.json to config.json and fill in your RPC URL and wallets.`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const cursors = existsSync(CURSORS) ? JSON.parse(readFileSync(CURSORS, "utf8")) : {};
const seen = new Set(
  existsSync(TRADES)
    ? readFileSync(TRADES, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).signature)
    : [],
);

async function poll({ address, label }) {
  // `until` walks forward from the last signature we recorded for this wallet.
  const sigs = await rpc(cfg.rpcUrl, "getSignaturesForAddress", [
    address,
    { limit: 50, ...(cursors[address] ? { until: cursors[address] } : {}) },
  ]);
  if (!sigs.length) return 0;

  let found = 0;
  // Oldest first, so a crash mid-batch leaves the cursor safely behind.
  for (const { signature } of [...sigs].reverse()) {
    if (seen.has(signature)) continue;
    const tx = await rpc(cfg.rpcUrl, "getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    const swap = extractSwap(tx, address);
    seen.add(signature);
    cursors[address] = signature;
    if (!swap || swap.solAmount < (cfg.minSolSize ?? 0)) continue;

    const row = { ts: new Date((tx.blockTime ?? 0) * 1000).toISOString(), slot: tx.slot, wallet: address, label, signature, ...swap };
    appendFileSync(TRADES, JSON.stringify(row) + "\n");
    console.log(`${row.ts}  ${label.padEnd(12)} ${swap.side.toUpperCase().padEnd(4)} ${swap.solAmount.toFixed(3)} SOL  ${swap.mint}`);
    found++;
  }
  writeFileSync(CURSORS, JSON.stringify(cursors, null, 2));
  return found;
}

console.log(`Watching ${cfg.wallets.length} wallet(s), polling every ${cfg.pollSeconds ?? 20}s. Read-only — no key loaded. Ctrl-C to stop.`);
for (;;) {
  for (const w of cfg.wallets) {
    try {
      await poll(w);
    } catch (e) {
      console.error(`[${w.label}] ${e.message}`);
    }
  }
  await new Promise((r) => setTimeout(r, (cfg.pollSeconds ?? 20) * 1000));
}
