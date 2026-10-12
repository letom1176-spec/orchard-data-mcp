// Shared helpers: RPC access and swap extraction. Read-only — nothing here signs.
export const WSOL = "So11111111111111111111111111111111111111112";
export const LAMPORTS = 1e9;

export async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

// Net SOL moved by `owner`, in SOL, excluding the fee they paid.
function solDelta(tx, owner) {
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const i = keys.indexOf(owner);
  if (i === -1) return 0;
  const fee = i === 0 ? tx.meta.fee : 0;
  return (tx.meta.postBalances[i] - tx.meta.preBalances[i] + fee) / LAMPORTS;
}

// Net change per SPL mint for `owner`, as a Map(mint -> uiAmount delta).
function tokenDeltas(tx, owner) {
  const out = new Map();
  const add = (rows, sign) => {
    for (const b of rows || []) {
      if (b.owner !== owner) continue;
      const amt = Number(b.uiTokenAmount?.uiAmount ?? 0);
      out.set(b.mint, (out.get(b.mint) ?? 0) + sign * amt);
    }
  };
  add(tx.meta.preTokenBalances, -1);
  add(tx.meta.postTokenBalances, +1);
  return out;
}

/**
 * Classify a transaction as a swap by the wallet's own balance changes, rather
 * than by decoding each DEX's instructions. This covers Jupiter, Raydium,
 * Meteora, Orca and pump.fun uniformly, and keeps working when they upgrade
 * their programs.
 */
export function extractSwap(tx, owner) {
  if (!tx?.meta || tx.meta.err) return null;

  const deltas = tokenDeltas(tx, owner);
  // Wrapped SOL is SOL for our purposes; fold it into the native delta.
  const wsol = deltas.get(WSOL) ?? 0;
  deltas.delete(WSOL);
  const sol = solDelta(tx, owner) + wsol;

  // Ignore dust from rent and account churn.
  const moved = [...deltas.entries()].filter(([, d]) => Math.abs(d) > 1e-9);
  if (moved.length !== 1 || Math.abs(sol) < 1e-6) return null;

  const [mint, tokenDelta] = moved[0];
  // A swap moves SOL and the token in opposite directions. Same direction means
  // an airdrop, transfer or LP action, not a trade.
  if (Math.sign(tokenDelta) === Math.sign(sol)) return null;

  const side = tokenDelta > 0 ? "buy" : "sell";
  return {
    side,
    mint,
    tokenAmount: Math.abs(tokenDelta),
    solAmount: Math.abs(sol),
    priceSol: Math.abs(sol) / Math.abs(tokenDelta),
  };
}
