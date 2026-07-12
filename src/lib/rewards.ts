// Weighted USDM reward tables per pack.
// Most rolls are BELOW pack price; break-even is uncommon; 2× is a rare jackpot.
export type RewardRoll = { amount: number; weight: number };

export const REWARD_TABLE: Record<string, RewardRoll[]> = {
  starter: [
    { amount: 0.001, weight: 40 },
    { amount: 0.002, weight: 25 },
    { amount: 0.003, weight: 18 },
    { amount: 0.005, weight: 12 },
    { amount: 0.01, weight: 5 },
  ],
  mystery: [
    { amount: 0.02, weight: 22 },
    { amount: 0.05, weight: 22 },
    { amount: 0.08, weight: 18 },
    { amount: 0.10, weight: 15 },
    { amount: 0.15, weight: 10 },
    { amount: 0.20, weight: 7 },
    { amount: 0.25, weight: 5 }, // break-even
    { amount: 0.50, weight: 1 }, // 2× jackpot
  ],
  alpha: [
    { amount: 0.10, weight: 22 },
    { amount: 0.20, weight: 22 },
    { amount: 0.30, weight: 18 },
    { amount: 0.40, weight: 15 },
    { amount: 0.50, weight: 10 },
    { amount: 0.60, weight: 7 },
    { amount: 0.75, weight: 5 },
    { amount: 1.50, weight: 1 },
  ],
  legendary: [
    { amount: 0.30, weight: 24 },
    { amount: 0.50, weight: 24 },
    { amount: 0.75, weight: 20 },
    { amount: 1.00, weight: 15 },
    { amount: 1.20, weight: 10 },
    { amount: 1.50, weight: 6 },
    { amount: 3.00, weight: 1 },
  ],
  explorer: [
    { amount: 0.50, weight: 22 },
    { amount: 0.75, weight: 22 },
    { amount: 1.00, weight: 18 },
    { amount: 1.50, weight: 14 },
    { amount: 2.00, weight: 10 },
    { amount: 2.50, weight: 7 },
    { amount: 3.00, weight: 6 },
    { amount: 6.00, weight: 1 },
  ],
};

export function rollUsdm(packId: string): number {
  const table = REWARD_TABLE[packId] || REWARD_TABLE.starter;
  const total = table.reduce((s, r) => s + r.weight, 0);
  let n = Math.random() * total;
  for (const r of table) {
    if ((n -= r.weight) <= 0) return r.amount;
  }
  return table[0].amount;
}

export function formatUsdm(n: number): string {
  return n < 0.01 ? n.toFixed(3) : n.toFixed(2);
}
