import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type CsvRow = {
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
  pattern: string;        // "*" is a catch-all
  matchType: string;      // "contains" | "regex"
  priority: number;       // higher wins
  accountNumber: number;
  fundId: number;
  tagId: number;
};

function matches(rule: Rule, descLower: string): boolean {
  if (rule.pattern === "*" || rule.pattern === "") return true;
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
  // No rule matched (not even a catch-all). Surface the gap rather than fake it.
  return { ...row, accountNumber: 0, fundId: 0, tagId: 0 };
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => {
      const o = Object.fromEntries(header.map((h, i) => [h, r[i]])) as Record<string, string>;
      return {
        depositDate: o["deposit_date"],
        payoutAmount: parseFloat(o["payout_amount"]),
        grossSales: parseFloat(o["Gross Sales"]),
        netSales: parseFloat(o["Net Sales"]),
        tip: parseFloat(o["Tip"]),
        totalCollected: parseFloat(o["Total Collected"]),
        fees: parseFloat(o["Fees"]),
        netTotal: parseFloat(o["Net Total"]),
        description: o["Description"],
      };
    });
}

function groupIntoDeposits(rows: CsvRow[], rules: Rule[]): Deposit[] {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  const groups = new Map<string, ClassifiedRow[]>();
  for (const r of rows) {
    const key = `${r.depositDate}:${r.payoutAmount.toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(classifyRow(r, sortedRules));
    groups.set(key, list);
  }

  const deposits: Deposit[] = [];
  for (const [id, classified] of groups) {
    const [date, payoutStr] = id.split(":");
    const payoutAmount = parseFloat(payoutStr);
    const totalGross = classified.reduce((s, r) => s + r.totalCollected, 0);
    const totalFees = classified.reduce((s, r) => s + r.fees, 0);

    // Rollup by Aplos posting target (account + fund + tag).
    // This matches the bucketing in aplos/post-square-deposits.js (`${account}:${tagId}`).
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
    const rollup = [...map.values()].sort((a, b) => b.amount - a.amount);

    deposits.push({
      id,
      date,
      payoutAmount,
      itemCount: classified.length,
      totalGross,
      totalFees,
      netTotal: payoutAmount,
      rows: classified,
      rollup,
    });
  }
  // Newest first
  deposits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return deposits;
}

// Reads every CSV in ../square/deposits and groups across all of them.
// Duplicates from overlapping CSVs naturally collapse because Deposit.id is
// `${date}:${amount}` — same deposit yields the same id.
export function loadAllDeposits(rules: Rule[]): { csvPaths: string[]; deposits: Deposit[] } {
  const dir = path.resolve(process.cwd(), "..", "square", "deposits");
  const csvs = readdirSync(dir).filter((f) => f.endsWith(".csv")).sort();
  if (csvs.length === 0) {
    throw new Error(`No CSV files in ${dir}`);
  }
  const allRows: CsvRow[] = [];
  const csvPaths: string[] = [];
  // Dedupe rows by their exact field signature so multi-file overlap doesn't
  // double-count.
  const seen = new Set<string>();
  for (const f of csvs) {
    const csvPath = path.join(dir, f);
    csvPaths.push(csvPath);
    const text = readFileSync(csvPath, "utf8");
    for (const r of parseCsv(text)) {
      const sig = `${r.depositDate}|${r.payoutAmount}|${r.totalCollected}|${r.fees}|${r.description}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      allRows.push(r);
    }
  }
  return { csvPaths, deposits: groupIntoDeposits(allRows, rules) };
}
