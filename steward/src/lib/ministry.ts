// Ministry (tag) financials with a CODE-ENFORCED clarification gate.
//
// The chat agent calls ministryFinancials() for any "received / spent / net"
// question about a ministry. If the named tag has sub-tags and the caller did
// NOT specify scope, this returns { status: "needs_scope" } WITHOUT any numbers
// — the model physically cannot answer until a scope is chosen. That's the
// difference between prompting the model to clarify (soft) and forcing it (hard).
//
// Conventions baked in (validated by hand): tag totals use income/expense lines
// only, income sign-flipped so "received" reads as money-in, balance-sheet tags
// excluded. Sub-tag rollup is one level deep (Aplos tags don't nest deeper).
import { prisma } from "./db";

export type MinistryScope = "parent_only" | "rolled_up";

type Named = { id: number; name: string };
type Line = { tagId: number; name: string; received: number; spent: number; net: number };

export type MinistryResult =
  | { status: "not_found"; query: string; suggestions: string[] }
  | { status: "ambiguous_name"; query: string; candidates: Named[] }
  | { status: "needs_scope"; tag: Named; children: Named[] }
  | {
      status: "ok";
      tag: Named;
      scope: MinistryScope;
      period: { startDate: string | null; endDate: string | null };
      totals: { received: number; spent: number; net: number };
      breakdown: Line[];
    };

const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function ministryFinancials(args: {
  name: string;
  scope?: MinistryScope;
  startDate?: string;
  endDate?: string;
}): Promise<MinistryResult> {
  const tags = await prisma.tag.findMany();
  const q = args.name.trim().toLowerCase();

  // Prefer an exact (case-insensitive) name; fall back to substring.
  let matches = tags.filter((t) => t.name.toLowerCase() === q);
  if (matches.length === 0) matches = tags.filter((t) => t.name.toLowerCase().includes(q));

  if (matches.length === 0) {
    return { status: "not_found", query: args.name, suggestions: tags.filter((t) => t.parentId == null).map((t) => t.name) };
  }
  if (matches.length > 1) {
    return { status: "ambiguous_name", query: args.name, candidates: matches.map((t) => ({ id: t.id, name: t.name })) };
  }

  const tag = matches[0];
  const children = tags.filter((t) => t.parentId === tag.id).map((t) => ({ id: t.id, name: t.name }));

  // THE GATE: parent has sub-tags and caller didn't say which → no numbers.
  if (children.length > 0 && args.scope !== "parent_only" && args.scope !== "rolled_up") {
    return { status: "needs_scope", tag: { id: tag.id, name: tag.name }, children };
  }

  const scope: MinistryScope = children.length === 0 ? "parent_only" : (args.scope as MinistryScope);
  const tagIds = scope === "rolled_up" ? [tag.id, ...children.map((c) => c.id)] : [tag.id];

  const startDate = isDate(args.startDate) ? args.startDate : null;
  const endDate = isDate(args.endDate) ? args.endDate : null;
  const dateClause =
    startDate && endDate ? `AND t.date >= '${startDate}' AND t.date <= '${endDate}'`
    : startDate ? `AND t.date >= '${startDate}'`
    : endDate ? `AND t.date <= '${endDate}'`
    : "";

  // tagIds are integers straight from our own DB; dates are regex-validated.
  const rows = await prisma.$queryRawUnsafe<Array<{ tagId: number; received: number; spent: number }>>(
    `SELECT tg.id AS tagId,
        ROUND(-SUM(CASE WHEN a.category='income'  THEN l.amount ELSE 0 END), 2) AS received,
        ROUND( SUM(CASE WHEN a.category='expense' THEN l.amount ELSE 0 END), 2) AS spent
       FROM AplosLineTag lt
       JOIN Tag tg ON tg.id = lt.tagId
       JOIN AplosTransactionLine l ON l.id = lt.lineId
       JOIN AplosTransaction t ON t.id = l.transactionId
       JOIN Account a ON a.accountNumber = l.accountNumber
      WHERE lt.tagId IN (${tagIds.join(",")}) AND a.category IN ('income','expense') ${dateClause}
      GROUP BY tg.id`,
  );

  const nameById = new Map(tags.map((t) => [t.id, t.name]));
  const rowById = new Map(rows.map((r) => [Number(r.tagId), r]));
  const breakdown: Line[] = tagIds.map((id) => {
    const r = rowById.get(id);
    const received = r ? Number(r.received) || 0 : 0;
    const spent = r ? Number(r.spent) || 0 : 0;
    return { tagId: id, name: nameById.get(id) ?? String(id), received, spent, net: round2(received - spent) };
  });

  const received = round2(breakdown.reduce((s, b) => s + b.received, 0));
  const spent = round2(breakdown.reduce((s, b) => s + b.spent, 0));
  return {
    status: "ok",
    tag: { id: tag.id, name: tag.name },
    scope,
    period: { startDate, endDate },
    totals: { received, spent, net: round2(received - spent) },
    breakdown,
  };
}
