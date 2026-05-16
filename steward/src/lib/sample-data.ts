export type SourcePayout = {
  id: string;
  date: string;
  desc: string;
  amount: number;
  source: "square" | "subsplash";
  sourceLabel: string;
  itemCount: number;
  feeAmount: number;
  note: string;
};

export type SquareItem = {
  id: string;
  payout: string;
  time: string;
  item: string;
  rule: string;
  fund: string;
  amount: number;
  qty: number;
};

export const SAMPLE_PAYOUTS: SourcePayout[] = [
  {
    id: "k-104",
    date: "May 11",
    desc: "SQUARE PAYOUT · DEP 5811",
    amount: 1247.5,
    source: "square",
    sourceLabel: "Square",
    itemCount: 38,
    feeAmount: -38.2,
    note: "Sunday coffee bar + bookstore + Men's Retreat tickets",
  },
];

export const SAMPLE_SQUARE_ITEMS: SquareItem[] = [
  { id: "sq-001", payout: "k-104", time: "8:42a",  item: "Drip Coffee · 12oz",       rule: "Programs · Coffee bar",     fund: "General", amount: 5.0,  qty: 12 },
  { id: "sq-002", payout: "k-104", time: "9:11a",  item: "Latte · 12oz",             rule: "Programs · Coffee bar",     fund: "General", amount: 5.5,  qty: 6 },
  { id: "sq-010", payout: "k-104", time: "9:28a",  item: "Mere Christianity (book)", rule: "Bookstore · Books",         fund: "General", amount: 18.0, qty: 3 },
  { id: "sq-011", payout: "k-104", time: "10:05a", item: "Children's Bible",         rule: "Bookstore · Books",         fund: "General", amount: 22.0, qty: 2 },
  { id: "sq-012", payout: "k-104", time: "10:32a", item: "Devotional Journal",       rule: "Bookstore · Resources",     fund: "General", amount: 14.0, qty: 3 },
  { id: "sq-020", payout: "k-104", time: "11:14a", item: "Men's Retreat — June",     rule: "Programs · Men's Retreat",  fund: "General", amount: 25.0, qty: 12 },
  { id: "sq-030", payout: "k-104", time: "11:48a", item: "T-shirt · After The One",  rule: "Programs · Merch",          fund: "General", amount: 18.0, qty: 2 },
];

export function rollupSquare(payoutId: string) {
  const map = new Map<string, { cat: string; fund: string; amount: number; count: number }>();
  for (const s of SAMPLE_SQUARE_ITEMS.filter((i) => i.payout === payoutId)) {
    const existing = map.get(s.rule);
    if (existing) {
      existing.amount += s.amount * s.qty;
      existing.count += s.qty;
    } else {
      map.set(s.rule, { cat: s.rule, fund: s.fund, amount: s.amount * s.qty, count: s.qty });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function fmtUSD(n: number, opts: { sign?: boolean; cents?: boolean } = {}) {
  const { sign = false, cents = true } = opts;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const lead = n < 0 ? "−" : sign ? "+" : "";
  return `${lead}$${s}`;
}
