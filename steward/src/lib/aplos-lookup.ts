import { prisma } from "./db";

export type AplosNames = {
  accounts: Map<number, { name: string; category: string | null }>;
  funds: Map<number, string>;
  tags: Map<number, { name: string; category: string | null; parentId: number | null }>;
  purposes: Map<number, { name: string; incomeAccount: number | null; fundId: number | null }>;
};

// One DB round-trip per table, returning Maps for cheap UI lookup.
export async function loadAplosNames(): Promise<AplosNames> {
  const [accounts, funds, tags, purposes] = await Promise.all([
    prisma.account.findMany(),
    prisma.fund.findMany(),
    prisma.tag.findMany(),
    prisma.purpose.findMany(),
  ]);
  return {
    accounts: new Map(accounts.map((a) => [a.accountNumber, { name: a.name, category: a.category }])),
    funds: new Map(funds.map((f) => [f.id, f.name])),
    tags: new Map(tags.map((t) => [t.id, { name: t.name, category: t.category, parentId: t.parentId }])),
    purposes: new Map(purposes.map((p) => [p.id, { name: p.name, incomeAccount: p.incomeAccount, fundId: p.fundId }])),
  };
}

export function accountName(names: AplosNames, n: number): string {
  return names.accounts.get(n)?.name ?? `Account ${n}`;
}
export function fundName(names: AplosNames, id: number): string {
  return names.funds.get(id) ?? `Fund ${id}`;
}
export function tagName(names: AplosNames, id: number): string {
  return names.tags.get(id)?.name ?? `Tag ${id}`;
}
export function tagParentId(names: AplosNames, id: number): number | null {
  return names.tags.get(id)?.parentId ?? null;
}

// ── Reverse lookups (label written by us or typed by the treasurer → id) ─────
// Both accept what the corresponding *Name() above would have produced, plus
// the shorthands someone editing the sheet by hand is likely to type.

// "5335 - Childcare Services" | "5335" | "Childcare Services" → 5335
export function accountNumberFromLabel(names: AplosNames, label: string): number | null {
  const s = (label ?? "").trim();
  if (!s) return null;
  const numeric = s.match(/^(\d{3,6})\b/);
  if (numeric) {
    const n = Number(numeric[1]);
    return names.accounts.has(n) ? n : null;
  }
  const lower = s.toLowerCase();
  for (const [n, a] of names.accounts) if (a.name.toLowerCase() === lower) return n;
  return null;
}

// "Kids" | "338179 - Kids" | "Tag 338179" → 338179
export function tagIdFromLabel(names: AplosNames, label: string): number | null {
  const s = (label ?? "").trim();
  if (!s) return null;
  const numeric = s.match(/^(?:tag\s+)?(\d{4,9})\b/i);
  if (numeric) {
    const id = Number(numeric[1]);
    return names.tags.has(id) ? id : null;
  }
  const lower = s.toLowerCase();
  for (const [id, t] of names.tags) if (t.name.toLowerCase() === lower) return id;
  return null;
}
