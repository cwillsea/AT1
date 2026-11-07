// Filesystem loader for payroll CSVs in ../payroll/batches/. Server only.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { parsePayrollCsv, classifyBatch, type PayrollBatch, type PayrollRule } from "./payroll-csv";

const BATCHES_DIR = path.resolve(process.cwd(), "..", "payroll", "batches");

export function getPayrollDir(): string {
  return BATCHES_DIR;
}

export async function loadPayrollRules(): Promise<PayrollRule[]> {
  const rows = await prisma.categorizationRule.findMany({
    where: { source: "payroll" },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
  return rows
    .filter((r) => r.accountNumber && r.fundId && r.tagId)
    .map((r) => ({ id: r.id, pattern: r.pattern, accountNumber: r.accountNumber!, fundId: r.fundId!, tagId: r.tagId! }));
}

// Reads every *.csv in payroll/batches/, oldest file first, so when the same
// Tracking ID shows up in two exports the newer file's copy wins. Returned
// newest effective date first.
export function loadAllPayrollBatches(rules: PayrollRule[]): { batches: PayrollBatch[]; csvPaths: string[] } {
  if (!existsSync(BATCHES_DIR)) return { batches: [], csvPaths: [] };
  const csvPaths = readdirSync(BATCHES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(BATCHES_DIR, f))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);

  const byId = new Map<string, PayrollBatch>();
  for (const p of csvPaths) {
    try {
      for (const b of parsePayrollCsv(readFileSync(p, "utf8"))) byId.set(b.id, b);
    } catch {
      // Not a payroll export — skip rather than take the page down.
    }
  }
  const batches = [...byId.values()]
    .map((b) => classifyBatch(b, rules))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.trackingId.localeCompare(a.trackingId));
  return { batches, csvPaths };
}
