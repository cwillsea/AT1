import { prisma } from "./db";

export type AplosNames = {
  accounts: Map<number, { name: string; category: string | null }>;
  funds: Map<number, string>;
  tags: Map<number, { name: string; category: string | null }>;
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
    tags: new Map(tags.map((t) => [t.id, { name: t.name, category: t.category }])),
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
