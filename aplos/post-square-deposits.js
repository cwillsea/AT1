// Post Square deposits (CSV) to Aplos as register transactions on 1110 Operating Checking.
//
// STATUS: parked pending Aplos support. The CSV parsing, grouping, classification, and
// transaction-building logic below is sound. The open question is the correct API shape
// to post a register transaction that includes a debit to an expense account (Square
// fees) and remains editable in the register UI. Every shape we tried — 3-line (cash
// net, income gross, fees +), 4-line (cash on both sides) — posts successfully and
// reports correctly, but throws "unexpected movement layout" on edit. The current code
// uses the 4-line shape as a placeholder; swap to whatever Aplos support tells us once
// they reply.
//
// WARNING: re-runs create duplicates — Aplos has no idempotency key. Track which CSVs
// you've posted. Leave DRY_RUN = true until you're ready to actually post.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAccessToken } from "./auth.js";
import { buildLine, postTransaction } from "./transactions.js";

// ─── CONFIG ───────────────────────────────────────────────────
const DRY_RUN = true;                  // false = actually POST every deposit
const ONLY_DEPOSITS = null;            // e.g. ['2026-04-22:0.82'] to filter by `${date}:${payout}`. null = all.
// ──────────────────────────────────────────────────────────────

const CASH = 1110;
const FEES = 5361;
const COFFEE = 4510;
const MERCH = 4520;
const FUND_GENERAL = 521243;
const TAG_HOLY_GROUNDS = 339545;
const TAG_YOUTH = 338178;
const TAG_GENERAL = 339561;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function resolveCsvPath() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const dir = path.join(repoRoot, "square", "deposits");
  const csvs = readdirSync(dir).filter((f) => f.endsWith(".csv"));
  if (csvs.length === 0) throw new Error(`No CSVs in ${dir}`);
  if (csvs.length > 1) {
    throw new Error(`Multiple CSVs in ${dir} — pass one as an arg: ${csvs.join(", ")}`);
  }
  return path.join(dir, csvs[0]);
}

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
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function classify(description) {
  const d = description.toLowerCase();
  const account = /shirt|raffle/.test(d) ? MERCH : COFFEE;
  const tagId = /youth|yth|holy pop/.test(d) ? TAG_YOUTH : TAG_HOLY_GROUNDS;
  return { account, tagId };
}

function buildDepositTx({ date, payout, rows }) {
  const buckets = new Map(); // key: `${account}:${tagId}` → amount
  let totalFees = 0;
  for (const r of rows) {
    const totalCollected = parseFloat(r["Total Collected"]);
    const fees = parseFloat(r["Fees"]);
    if (totalCollected < 0 || fees < 0) {
      throw new Error(`Negative amount on ${date} payout ${payout}: ${JSON.stringify(r)}`);
    }
    const { account, tagId } = classify(r["Description"]);
    const key = `${account}:${tagId}`;
    buckets.set(key, (buckets.get(key) ?? 0) + totalCollected);
    totalFees += fees;
  }

  // Placeholder shape (4-line cash-on-both-sides). Posts and reports correctly but is
  // NOT register-editable in the UI. Pending Aplos support response on the correct shape.
  const gross = [...buckets.values()].reduce((s, v) => s + v, 0);
  const lines = [
    buildLine({ accountNumber: CASH, fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount: gross }),
  ];
  if (totalFees > 0) {
    lines.push(buildLine({ accountNumber: CASH, fundId: FUND_GENERAL, tagIds: [TAG_GENERAL], amount: -totalFees }));
    lines.push(buildLine({ accountNumber: FEES, fundId: FUND_GENERAL, tagIds: [TAG_GENERAL], amount: totalFees }));
  }
  for (const [key, amount] of buckets) {
    const [accountStr, tagStr] = key.split(":");
    lines.push(buildLine({
      accountNumber: parseInt(accountStr, 10),
      fundId: FUND_GENERAL,
      tagIds: [parseInt(tagStr, 10)],
      amount: -amount,
    }));
  }

  return {
    date,
    note: `Square deposit ${date} $${payout.toFixed(2)}`,
    contact: { companyname: "Square", type: "company" },
    lines,
  };
}

// ─── main ─────────────────────────────────────────────────────
const csvPath = resolveCsvPath();
console.log(`Reading ${csvPath}\n`);
const rows = parseCsv(readFileSync(csvPath, "utf8"));

const groups = new Map();
for (const r of rows) {
  const key = `${r.deposit_date}:${parseFloat(r.payout_amount).toFixed(2)}`;
  if (!groups.has(key)) {
    groups.set(key, { date: r.deposit_date, payout: parseFloat(r.payout_amount), rows: [] });
  }
  groups.get(key).rows.push(r);
}

const normalize = (k) => {
  const [d, p] = k.split(":");
  return `${d}:${parseFloat(p).toFixed(2)}`;
};
const filtered = ONLY_DEPOSITS
  ? [...groups.entries()].filter(([k]) => ONLY_DEPOSITS.map(normalize).includes(k))
  : [...groups.entries()];

console.log(`Found ${groups.size} deposits, processing ${filtered.length}:\n`);

const txs = [];
for (const [key, g] of filtered) {
  const tx = buildDepositTx(g);
  const sum = tx.lines.reduce((s, l) => s + l.amount, 0);
  const incomeLines = tx.lines.length - 2; // minus cash + fees
  console.log(
    `  ${key}  payout=$${g.payout.toFixed(2).padStart(7)}  rows=${String(g.rows.length).padStart(3)}  income_lines=${incomeLines}  balance=${sum.toFixed(4)}`,
  );
  if (Math.abs(sum) > 0.005) throw new Error(`Deposit ${key} does not balance: ${sum}`);
  txs.push({ key, tx });
}

if (DRY_RUN) {
  console.log("\nFirst deposit JSON (full body):\n");
  console.log(JSON.stringify(txs[0].tx, null, 2));
  console.log("\n[DRY_RUN] Nothing posted. Set DRY_RUN=false to submit.");
  process.exit(0);
}

const token = await getAccessToken();
console.log(`\nGot token, posting ${txs.length} deposits…\n`);
for (const { key, tx } of txs) {
  const { status, body } = await postTransaction(token, tx);
  const id = body?.data?.transaction?.id ?? "?";
  console.log(`  ${key}  → ${status}  id=${id}`);
  if (status >= 400) {
    console.error("Response body:", JSON.stringify(body, null, 2));
    process.exit(1);
  }
}
console.log("\nDone.");
