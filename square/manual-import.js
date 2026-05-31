#!/usr/bin/env node
// Generates an Aplos general-ledger import XLSX from Square deposit CSVs + DB rules.
// Run:    node square/manual-import.js
// Output: square/aplos-import-<today>.xlsx

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const XLSX = require(path.join(__dir, "../steward/node_modules/xlsx"));

const Database = require(path.join(__dir, "../steward/node_modules/better-sqlite3"));

// ── DB lookups ───────────────────────────────────────────────────────────────

const db = new Database(path.join(__dir, "../steward/dev.db"), { readonly: true });

const rules = db
  .prepare(
    `SELECT pattern, matchType, priority, accountNumber, fundId, tagId
     FROM CategorizationRule WHERE source = 'square' ORDER BY priority DESC`
  )
  .all();

const accountMap = new Map(
  db.prepare("SELECT accountNumber, name FROM Account").all()
    .map((r) => [r.accountNumber, r.name])
);

const fundMap = new Map(
  db.prepare("SELECT id, name FROM Fund").all()
    .map((r) => [r.id, r.name])
);

const tagMap = new Map(
  db.prepare("SELECT id, name FROM Tag").all()
    .map((r) => [r.id, r.name])
);

db.close();

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') { inQuotes = true; }
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
      const o = Object.fromEntries(header.map((h, i) => [h, r[i]]));
      return {
        depositDate: o["deposit_date"],
        payoutAmount: parseFloat(o["payout_amount"]),
        totalCollected: parseFloat(o["Total Collected"]),
        fees: parseFloat(o["Fees"]),
        description: o["Description"],
      };
    });
}

// ── Classification ───────────────────────────────────────────────────────────

function matches(rule, descLower) {
  if (rule.pattern === "*" || rule.pattern === "") return true;
  if (rule.matchType === "regex") {
    try { return new RegExp(rule.pattern, "i").test(descLower); } catch { return false; }
  }
  return descLower.includes(rule.pattern.toLowerCase());
}

function classify(description) {
  const d = description.toLowerCase();
  for (const rule of rules) {
    if (matches(rule, d)) {
      return { accountNumber: rule.accountNumber, fundId: rule.fundId, tagId: rule.tagId };
    }
  }
  return { accountNumber: 0, fundId: 0, tagId: 0 };
}

// ── Load + group ─────────────────────────────────────────────────────────────

const depositsDir = path.join(__dir, "deposits");
const csvFiles = readdirSync(depositsDir).filter((f) => f.endsWith(".csv")).sort();

if (csvFiles.length === 0) {
  console.error("No CSV files found in square/deposits/");
  process.exit(1);
}

console.log(`Reading: ${csvFiles.join(", ")}`);

const allRows = [];
for (const f of csvFiles) {
  for (const row of parseCsv(readFileSync(path.join(depositsDir, f), "utf8"))) {
    allRows.push(row);
  }
}

// Group by deposit_date + payout_amount to collapse line items into one deposit per payout
const groups = new Map();
for (const row of allRows) {
  const key = `${row.depositDate}:${row.payoutAmount.toFixed(2)}`;
  const list = groups.get(key) ?? [];
  list.push({ ...row, ...classify(row.description) });
  groups.set(key, list);
}

// ── Format helpers ───────────────────────────────────────────────────────────

function fmtAccount(num) {
  const name = accountMap.get(num) ?? `Account ${num}`;
  return `${num} - ${name}`;
}

function fmtDate(iso) {
  // Aplos import expects MM/DD/YYYY
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ── Build output rows ────────────────────────────────────────────────────────

const HEADER = ["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Ministry"];
const outputRows = [HEADER];

// Newest deposit first
const sortedKeys = [...groups.keys()].sort().reverse();

for (const key of sortedKeys) {
  const rows = groups.get(key);
  const [date] = key.split(":");

  // Rollup: sum totalCollected by account + fund + tag
  const rollupMap = new Map();
  let totalFees = 0;
  for (const r of rows) {
    const rk = `${r.accountNumber}:${r.fundId}:${r.tagId}`;
    const entry = rollupMap.get(rk) ?? {
      accountNumber: r.accountNumber,
      fundId: r.fundId,
      tagId: r.tagId,
      amount: 0,
    };
    entry.amount += r.totalCollected;
    rollupMap.set(rk, entry);
    totalFees += r.fees;
  }

  const splits = [...rollupMap.values()].sort((a, b) => b.amount - a.amount);

  splits.forEach((split, i) => {
    const account = fmtAccount(split.accountNumber);
    const fund = fundMap.get(split.fundId) ?? `Fund ${split.fundId}`;
    const tag = tagMap.get(split.tagId) ?? "";
    const amount = split.amount.toFixed(2);

    if (i === 0) {
      outputRows.push([fmtDate(date), `Square Payout ${fmtDate(date)}`, "Square", "", account, fund, "", amount, tag]);
    } else {
      outputRows.push(["", "", "", "", account, fund, "", amount, tag]);
    }
  });

  outputRows.push(["", "", "", "", "5361 - Square Fees", "General Fund", "", `-${totalFees.toFixed(2)}`, "General"]);
}

// ── Write real XLSX ───────────────────────────────────────────────────────────

const _d = new Date();
const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
const outPath = path.join(__dir, "aplos-imports", `aplos-import-${today}.xlsx`);

const ws = XLSX.utils.aoa_to_sheet(outputRows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Import");
XLSX.writeFile(wb, outPath);

console.log(`\nWritten: ${outPath}`);
console.log(`${sortedKeys.length} deposit(s), ${outputRows.length - 1} split rows`);
