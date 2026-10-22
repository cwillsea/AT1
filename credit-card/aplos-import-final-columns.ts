#!/usr/bin/env tsx
// Produces a companion CSV with two columns aligned 1:1 to the input rows:
//   "Accountant Use: Final Expense Type"
//   "Accountant Use: Final Ministry Type"
// Same row order as the input (skipped rows = empty cells) so the user can
// paste the columns back into the original Truist file.
//
// Usage:
//   npx tsx credit-card/aplos-import-final-columns.ts "<input.csv>" [<output.csv>]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  parseCsv, parseAmount, classifyExpense, classifyMinistry, cleanMerchant,
  DEFAULT_ACCOUNT, DEFAULT_FUND_ID, DEFAULT_TAG_ID,
  type CreditCardRules,
} from "../steward/src/lib/credit-card-mappings";

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const Database = require(path.join(__dir, "../steward/node_modules/better-sqlite3"));

const inPath = process.argv[2];
if (!inPath) { console.error("usage: npx tsx credit-card/aplos-import-final-columns.ts <input.csv> [output.csv]"); process.exit(1); }
const outPath = process.argv[3] ?? path.join(
  path.dirname(inPath),
  path.basename(inPath, path.extname(inPath)) + "-accountant-columns.csv",
);

// ── Load lookups + rules from DB ─────────────────────────────────────────────

const db = new Database(path.join(__dir, "../steward/dev.db"), { readonly: true });

const accountMap = new Map<number, string>(
  db.prepare("SELECT accountNumber, name FROM Account").all()
    .map((r: { accountNumber: number; name: string }) => [r.accountNumber, r.name]),
);
const tagMap = new Map<number, string>(
  db.prepare("SELECT id, name FROM Tag").all()
    .map((r: { id: number; name: string }) => [r.id, r.name]),
);

const ruleRows = (source: string) =>
  db.prepare("SELECT pattern, accountNumber, fundId, tagId, label FROM CategorizationRule WHERE source = ? ORDER BY priority DESC, id ASC").all(source);

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

// ── Build columns ────────────────────────────────────────────────────────────

const raw = readFileSync(inPath, "utf8").replace(/^﻿/, "");
const csvRows = parseCsv(raw);

const hdrIdx = csvRows.findIndex((r) => r[0] && r[0].trim() === "Cardholder Name");
const header = csvRows[hdrIdx];
const col = (r: string[], name: string) => {
  const i = header.indexOf(name);
  return i >= 0 ? (r[i] ?? "").trim() : "";
};

const acctName = (n: number) => accountMap.get(n) ?? `Account ${n}`;
const tagName = (id: number) => tagMap.get(id) ?? "";

function encField(v: string) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toRow = (vals: string[]) => vals.map(encField).join(",");

const out: string[] = [
  toRow(["Accountant Use: Final Expense Type", "Accountant Use: Final Ministry Type"]),
];

let classified = 0;
for (let i = hdrIdx + 1; i < csvRows.length; i++) {
  const r = csvRows[i];

  // Skip blank lines and the "Total" trailer — emit empty cells so positions align.
  const cardholder = col(r, "Cardholder Name");
  const merchant   = col(r, "Merchant Name");
  const amountRaw  = col(r, "Amount");
  const expenseType = col(r, "Expense Type");
  const ministry    = col(r, "Ministry / Ministry Event");
  const amount      = parseAmount(amountRaw);

  const isBlank =
    !r || r.length < 4 ||
    cardholder.toLowerCase() === "total" ||
    (!amountRaw && !merchant) ||
    !isFinite(amount);

  if (isBlank) { out.push(toRow(["", ""])); continue; }

  // Account
  const acctNum = classifyExpense(expenseType, rules.expense) ?? DEFAULT_ACCOUNT;
  const finalExpense = `${acctNum} - ${acctName(acctNum)}`;

  // Tag (with the same expense-type fallback the import uses)
  let resolved = classifyMinistry(ministry, rules.ministry);
  const isWeak = !resolved || (resolved.tagId === DEFAULT_TAG_ID && resolved.fundId === DEFAULT_FUND_ID);
  if (isWeak) {
    const fromExpense = classifyMinistry(expenseType, rules.ministry);
    if (fromExpense && fromExpense.tagId !== DEFAULT_TAG_ID) resolved = fromExpense;
  }
  const tagId = resolved?.tagId ?? DEFAULT_TAG_ID;
  const finalMinistry = tagName(tagId);

  out.push(toRow([finalExpense, finalMinistry]));
  classified++;
}

writeFileSync(outPath, "﻿" + out.join("\n"), "utf8");
console.log(`Wrote ${classified} classified rows (${out.length - 1} total including blanks) → ${outPath}`);
console.log(`Paste these two columns into the "Accountant Use" columns of the original file, starting at the same row as the data (just below the header).`);
