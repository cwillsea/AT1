// Server-only: filesystem reader for the Square deposit CSVs. Kept apart from
// square-csv.ts so the pure classifier file remains client-importable.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  buildRollup,
  classifyRow,
  type ClassifiedRow,
  type CsvRow,
  type Deposit,
  type Rule,
} from "./square-csv";

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
        depositId: o["deposit_id"],
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
  const meta = new Map<string, { date: string; payoutAmount: number }>();
  for (const r of rows) {
    const key = r.depositId;
    const list = groups.get(key) ?? [];
    list.push(classifyRow(r, sortedRules));
    groups.set(key, list);
    if (!meta.has(key)) meta.set(key, { date: r.depositDate, payoutAmount: r.payoutAmount });
  }

  const deposits: Deposit[] = [];
  for (const [id, classified] of groups) {
    const { date, payoutAmount } = meta.get(id)!;
    const totalGross = classified.reduce((s, r) => s + r.totalCollected, 0);
    const totalFees = classified.reduce((s, r) => s + r.fees, 0);
    deposits.push({
      id,
      date,
      payoutAmount,
      itemCount: classified.length,
      totalGross,
      totalFees,
      netTotal: payoutAmount,
      rows: classified,
      rollup: buildRollup(classified),
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
  for (const f of csvs) {
    const csvPath = path.join(dir, f);
    csvPaths.push(csvPath);
    const text = readFileSync(csvPath, "utf8");
    for (const r of parseCsv(text)) {
      allRows.push(r);
    }
  }
  return { csvPaths, deposits: groupIntoDeposits(allRows, rules) };
}
