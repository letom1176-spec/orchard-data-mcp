// Scores what copying these wallets WOULD have returned. No trading happens here.
import { readFileSync, existsSync } from "node:fs";

const TRADES = "./trades.jsonl";
// You never get the leader's fill. You see their trade, then buy after them, into
// the price their own buy just moved. SLIPPAGE_PCT is your assumed penalty on
// every entry and exit; FEE_SOL is priority fee + DEX fee per leg.
const SLIPPAGE_PCT = Number(process.env.SLIPPAGE_PCT ?? 3);
const FEE_SOL = Number(process.env.FEE_SOL ?? 0.0006);

if (!existsSync(TRADES)) {
  console.error("No trades.jsonl yet — run `node watch.mjs` first.");
  process.exit(1);
}
const trades = readFileSync(TRADES, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
trades.sort((a, b) => a.slot - b.slot);

async function priceInSol(mints) {
  const out = new Map();
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${batch.join(",")}&vsToken=So11111111111111111111111111111111111111112`);
      const { data } = await res.json();
      for (const m of batch) if (data?.[m]?.price) out.set(m, Number(data[m].price));
    } catch { /* unpriced mints are treated as worthless below */ }
  }
  return out;
}

// FIFO-match each wallet's sells against its own buys, per mint.
const books = new Map();
const closed = [];
for (const t of trades) {
  const key = `${t.wallet}|${t.mint}`;
  if (!books.has(key)) books.set(key, []);
  const lots = books.get(key);
  const entry = t.priceSol * (1 + SLIPPAGE_PCT / 100);
  const exit = t.priceSol * (1 - SLIPPAGE_PCT / 100);

  if (t.side === "buy") {
    lots.push({ qty: t.tokenAmount, entry, ts: t.ts, label: t.label, mint: t.mint });
    continue;
  }
  let remaining = t.tokenAmount;
  while (remaining > 1e-12 && lots.length) {
    const lot = lots[0];
    const qty = Math.min(remaining, lot.qty);
    closed.push({ label: t.label, mint: t.mint, qty, entry: lot.entry, exit, openedAt: lot.ts, closedAt: t.ts });
    lot.qty -= qty;
    remaining -= qty;
    if (lot.qty <= 1e-12) lots.shift();
  }
}

const open = [...books.values()].flat().filter((l) => l.qty > 1e-12);
const marks = await priceInSol([...new Set(open.map((l) => l.mint))]);

const perWallet = new Map();
const bump = (label, field, v) => {
  if (!perWallet.has(label)) perWallet.set(label, { realized: 0, unrealized: 0, wins: 0, losses: 0, fees: 0, openCount: 0 });
  perWallet.get(label)[field] += v;
};

for (const c of closed) {
  const pnl = (c.exit - c.entry) * c.qty - FEE_SOL * 2;
  bump(c.label, "realized", pnl);
  bump(c.label, "fees", FEE_SOL * 2);
  bump(c.label, pnl > 0 ? "wins" : "losses", 1);
}
for (const l of open) {
  // A mint Jupiter cannot price is almost always dead. Marking it at zero is the
  // honest default; marking it at cost is how paper results lie.
  const mark = marks.get(l.mint) ?? 0;
  bump(l.label, "unrealized", (mark * (1 - SLIPPAGE_PCT / 100) - l.entry) * l.qty - FEE_SOL);
  bump(l.label, "openCount", 1);
}

const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(4);
console.log(`\nPaper copy-trade result — ${trades.length} swaps, ${closed.length} round trips`);
console.log(`Assumes ${SLIPPAGE_PCT}% slippage per leg and ${FEE_SOL} SOL fees per leg. NO REAL TRADES.\n`);
console.log("wallet        round trips   win%   realized SOL   unrealized SOL   open   total SOL");
let total = 0;
for (const [label, s] of [...perWallet].sort((a, b) => (b[1].realized + b[1].unrealized) - (a[1].realized + a[1].unrealized))) {
  const n = s.wins + s.losses;
  const net = s.realized + s.unrealized;
  total += net;
  console.log(
    label.padEnd(14) + String(n).padStart(11) + (n ? ((100 * s.wins) / n).toFixed(0) + "%" : "  -").padStart(7) +
    fmt(s.realized).padStart(15) + fmt(s.unrealized).padStart(17) + String(s.openCount).padStart(7) + fmt(net).padStart(12),
  );
}
console.log("\n" + "".padEnd(52) + "NET".padStart(10) + fmt(total).padStart(12) + " SOL");
if (closed.length < 30) console.log(`\nOnly ${closed.length} closed trades. Too few to mean anything — keep it running.`);
