#!/usr/bin/env tsx
// CLI: transform a Truist credit-card "Purchases Due" CSV (with Expense Type +
// Ministry columns filled in) into an Aplos GL import XLSX. Rules + Aplos
// names are all loaded from steward/dev.db so the CLI stays in lockstep
// with what the /credit-card page produces.
//
// Usage (run from at1/ or steward/):
//   npx tsx credit-card/aplos-import.ts "<input.csv>" [<output.xlsx>]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { transform, type CreditCardRules } from "../steward/src/lib/credit-card-mappings";

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const XLSX = require(path.join(__dir, "../steward/node_modules/xlsx"));
const Database = require(path.join(__dir, "../steward/node_modules/better-sqlite3"));

const inPath = process.argv[2];
if (!inPath) {
  console.error("usage: npx tsx credit-card/aplos-import.ts <input.csv> [output.xlsx]");
  process.exit(1);
}
const outPath = process.argv[3] ?? path.join(
  path.dirname(inPath),
  path.basename(inPath, path.extname(inPath)) + "-aplos.xlsx",
);

// ── Load everything from steward/dev.db ──────────────────────────────────────

const db = new Database(path.join(__dir, "../steward/dev.db"), { readonly: true });

const accountMap = new Map<number, string>(
  db.prepare("SELECT accountNumber, name FROM Account").all()
    .map((r: { accountNumber: number; name: string }) => [r.accountNumber, r.name]),
);
const fundMap = new Map<number, string>(
  db.prepare("SELECT id, name FROM Fund").all()
    .map((r: { id: number; name: string }) => [r.id, r.name]),
);
const tagMap = new Map<number, string>(
  db.prepare("SELECT id, name FROM Tag").all()
    .map((r: { id: number; name: string }) => [r.id, r.name]),
);

const ruleRows = (source: string) =>
  db.prepare(
    `SELECT pattern, accountNumber, fundId, tagId, label
     FROM CategorizationRule WHERE source = ?
     ORDER BY priority DESC, id ASC`,
  ).all(source);

const rules: CreditCardRules = {
  expense: ruleRows("credit-card-expense")
    .filter((r: { accountNumber: number | null }) => r.accountNumber != null)
    .map((r: { pattern: string; accountNumber: number }) => ({ pattern: r.pattern, accountNumber: r.accountNumber })),
  ministry: ruleRows("credit-card-ministry")
    .filter((r: { fundId: number | null; tagId: number | null }) => r.fundId != null && r.tagId != null)
    .map((r: { pattern: string; fundId: number; tagId: number }) => ({ pattern: r.pattern, fundId: r.fundId, tagId: r.tagId })),
  merchant: ruleRows("credit-card-merchant")
    .filter((r: { label: string | null }) => r.label != null)
    .map((r: { pattern: string; label: string }) => ({ pattern: r.pattern, label: r.label })),
};

db.close();

if (rules.expense.length === 0) {
  console.error("No credit-card-expense rules in DB. Run: npx tsx scripts/seed-credit-card-rules.ts (from steward/)");
  process.exit(1);
}

// ── Run ──────────────────────────────────────────────────────────────────────

const csvText = readFileSync(inPath, "utf8");

const { rows, warnings } = transform(csvText, rules, {
  accountName: (n) => accountMap.get(n) ?? `Account ${n}`,
  fundName: (id) => fundMap.get(id) ?? `Fund ${id}`,
  tagName: (id) => tagMap.get(id) ?? "",
});

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Import");
XLSX.writeFile(wb, outPath);

console.log(`Wrote ${rows.length - 1} rows → ${outPath}`);
console.log(`Loaded ${rules.expense.length} expense / ${rules.ministry.length} ministry / ${rules.merchant.length} merchant rules from DB`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log("  " + w);
}
