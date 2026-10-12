# copytrade-tracker

Measures what copy-trading a set of Solana wallets **would** have returned, before
you risk anything. It watches wallets, records every swap, and scores the result
with your real slippage and fees charged against it.

It is read-only by construction. No private key is loaded, no keypair is
imported, nothing here can move funds.

## Why measure first

You never get the leader's fill. You see their trade *after* it lands, then buy
into the price their own buy just moved. On a thin memecoin pool that gap is
routinely larger than the edge being copied. This tool measures that gap on the
specific wallets you want to follow, at your latency.

The test suite pins the point: a leader round trip of **+5%** scores as a **loss**
for the copier once 3% slippage per leg and fees are charged.

## Use

```bash
cp config.example.json config.json   # add your RPC URL and wallet addresses
node watch.mjs                       # leave running — appends to trades.jsonl
node report.mjs                      # paper P&L, any time
```

Any Solana RPC with `getSignaturesForAddress` works (Helius, QuickNode, Triton).
A free tier is fine at a 20s poll. Get wallet addresses from a leaderboard or
explorer and paste them into `config.json`.

Tune the cost assumptions — they dominate the result:

```bash
SLIPPAGE_PCT=5 FEE_SOL=0.001 node report.mjs
```

## How swaps are detected

By diffing the wallet's own pre/post balances in each transaction, not by
decoding DEX instructions. One SPL mint moving opposite the wallet's SOL is a
swap. This covers Jupiter, Raydium, Meteora, Orca and pump.fun with one code
path, and survives their program upgrades. Wrapped SOL is folded into the native
balance, so wrapping is not miscounted as a token leg.

## Reading the output

- **Give it 30+ closed round trips** before drawing any conclusion. The report
  says so when you have fewer.
- **Open positions in mints Jupiter cannot price are marked at zero**, not at
  cost. Dead tokens are the usual reason a mint is unpriceable, and marking them
  at cost is the standard way paper results flatter themselves.
- **Win rate is not the number that matters.** A wallet can win 70% of trades and
  still lose money. Read the SOL column.

## Limits

- Exits are FIFO-matched per wallet and mint, which is a convention, not a
  reconstruction of the leader's intent.
- Polling adds latency beyond what a real bot would have; results here are
  optimistic if anything, since real fills arrive later still.
- Token-for-token swaps that never touch SOL are skipped.

`node test.mjs` runs the suite. No network required.
