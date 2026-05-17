// Pure classifier + rollup logic. No node:fs/node:path imports — this file is
// safe to import from client components. See square-csv-server.ts for the
// filesystem-backed loader used by server pages.

export type CsvRow = {
  depositId: string;
  depositDate: string;
  payoutAmount: number;
  grossSales: number;
  netSales: number;
  tip: number;
  totalCollected: number;
  fees: number;
  netTotal: number;
  description: string;
};

// Classification result: pure IDs, no human-readable labels.
// Human labels come from looking up the IDs against the cached Aplos data.
export type ClassifiedRow = CsvRow & {
  accountNumber: number;
  fundId: number;
  tagId: number;
};

export type Deposit = {
  id: string;
  date: string;
  payoutAmount: number;
  itemCount: number;
  totalGross: number;
  totalFees: number;
  netTotal: number;
  rows: ClassifiedRow[];
  rollup: RollupLine[];
};

export type RollupLine = {
  accountNumber: number;
  fundId: number;
  tagId: number;
  count: number;
  amount: number;
};

// Minimal shape for a categorization rule, matching the CategorizationRule
// model. We re-declare it here so this file stays usable as a pure utility
// (no Prisma imports), letting both server pages and the CLI rollup logic
// consume the same classifier.
export type Rule = {
  id: number;
  pattern: string;
  matchType: string;      // "contains" | "regex"
  priority: number;       // higher wins
  accountNumber: number;
  fundId: number;
  tagId: number;
};

function matches(rule: Rule, descLower: string): boolean {
  // Catch-alls are no longer supported. An empty or "*" pattern is treated as
  // a no-op so any legacy DB rows don't silently swallow everything.
  if (rule.pattern === "*" || rule.pattern === "") return false;
  if (rule.matchType === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(descLower);
    } catch {
      return false;
    }
  }
  return descLower.includes(rule.pattern.toLowerCase());
}

// First match by priority desc wins. Rules should arrive pre-sorted.
export function classifyRow(row: CsvRow, sortedRules: Rule[]): ClassifiedRow {
  const d = row.description.toLowerCase();
  for (const rule of sortedRules) {
    if (matches(rule, d)) {
      return {
        ...row,
        accountNumber: rule.accountNumber,
        fundId: rule.fundId,
        tagId: rule.tagId,
      };
    }
  }
  // No rule matched. Surface the gap rather than fake it.
  return { ...row, accountNumber: 0, fundId: 0, tagId: 0 };
}

export function buildRollup(classified: ClassifiedRow[]): RollupLine[] {
  // Rollup by Aplos posting target (account + fund + tag).
  // Matches the bucketing in aplos/post-square-deposits.js (`${account}:${tagId}`).
  const map = new Map<string, RollupLine>();
  for (const r of classified) {
    const key = `${r.accountNumber}:${r.fundId}:${r.tagId}`;
    const existing = map.get(key);
    if (existing) {
      existing.amount += r.totalCollected;
      existing.count += 1;
    } else {
      map.set(key, {
        accountNumber: r.accountNumber,
        fundId: r.fundId,
        tagId: r.tagId,
        count: 1,
        amount: r.totalCollected,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

// Re-runs classification against a new rules list and rebuilds the rollup.
// Used by the client after a new rule is added inline, so we can update
// the affected deposit in place without a full page reload.
export function reclassifyDeposit(deposit: Deposit, rules: Rule[]): Deposit {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  const classified = deposit.rows.map((r) => classifyRow(r, sortedRules));
  return { ...deposit, rows: classified, rollup: buildRollup(classified) };
}
