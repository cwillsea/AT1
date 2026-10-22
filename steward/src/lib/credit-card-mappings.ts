// Pure credit-card → Aplos transform. No rules baked in: caller passes them
// as plain data (loaded from CategorizationRule rows). This module knows
// nothing about Prisma, fetch, or the filesystem — caller wires everything up.
//
// The three rule lists mirror three sources in CategorizationRule:
//   "credit-card-expense"  — regex on Expense Type → accountNumber
//   "credit-card-ministry" — substring on Ministry → fundId + tagId
//   "credit-card-merchant" — regex on Merchant     → label (display name)

export type ExpenseRule   = { pattern: string; accountNumber: number };
export type MinistryRule  = { pattern: string; fundId: number; tagId: number };
export type MerchantRule  = { pattern: string; label: string };

export type CreditCardRules = {
  expense:  ExpenseRule[];
  ministry: MinistryRule[];
  merchant: MerchantRule[];
};

export type AplosLookups = {
  accountName: (n: number) => string;
  fundName: (id: number) => string;
  tagName: (id: number) => string;
};

// Extra resolvers needed to read the "Accountant Use" columns back in — the
// inverse of AplosLookups. Caller owns the Aplos name tables, so it supplies
// these; this module stays free of Prisma and of the account/tag lists.
export type ReverseLookups = AplosLookups & {
  // "5335 - Childcare Services" | "5335" | "Childcare Services" → 5335
  accountNumberFromLabel: (label: string) => number | null;
  // "Kids" | "Tag 338179" → 338179
  tagIdFromLabel: (label: string) => number | null;
  // "Youth - Nationals" → "Youth"; null for a top-level tag
  tagParentId: (id: number) => number | null;
};

// Defaults used when nothing matches. Could move into the rules table if we
// ever want them user-editable, but for now they're hardcoded.
export const DEFAULT_ACCOUNT = 5900;          // Miscellaneous Expenses
export const DEFAULT_FUND_ID = 521243;        // General Fund
export const DEFAULT_TAG_ID  = 339561;        // General

// ── Classifiers (operate over caller-supplied rule lists) ────────────────────

const norm = (s: string) =>
  (s ?? "").trim().toLowerCase().replace(/[^a-z0-9 &/]/g, "").replace(/\s+/g, " ");

function compile(pattern: string): RegExp | null {
  try { return new RegExp(pattern, "i"); } catch { return null; }
}

export function classifyExpense(raw: string, rules: ExpenseRule[]): number | null {
  const t = norm(raw);
  for (const r of rules) {
    const re = compile(r.pattern);
    if (re && re.test(t)) return r.accountNumber;
  }
  return null;
}

export function classifyMinistry(raw: string, rules: MinistryRule[]): { fundId: number; tagId: number } | null {
  const t = norm(raw);
  if (!t) return null;
  for (const r of rules) {
    if (t.includes(r.pattern.toLowerCase())) return { fundId: r.fundId, tagId: r.tagId };
  }
  return null;
}

export function cleanMerchant(raw: string, rules: MerchantRule[]): string {
  const s = (raw ?? "").trim();
  if (!s) return s;
  for (const r of rules) {
    const re = compile(r.pattern);
    if (re && re.test(s)) return r.label;
  }
  return s.replace(/\s*#\s*\d+.*$/, "").replace(/\s+\d{3,}.*$/, "").trim();
}

// ── CSV / format helpers ─────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim();
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return neg ? -n : n;
}

// "KAITLYN BUSTAMANTE" → "Kaitlyn Bustamante". Leaves mixed-case input alone.
export function titleCase(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return t;
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
}

// ── Core transform ───────────────────────────────────────────────────────────

export type TransformResult = {
  rows: (string | number)[][];
  warnings: string[];
};

// A report row whose Expense Type or Ministry text no rule matched. Step 2
// halts on these so the treasurer can write rules (or override the row) before
// anything silently defaults to 5900 / General.
export type FlaggedRow = {
  row: number;             // 1-based sheet row, same numbering as the warnings
  date: string;
  cardholder: string;
  merchant: string;
  amount: string;
  expenseType: string;     // as the cardholder typed it
  expenseKey: string;      // normalized form the expense rules are tested against
  expenseMatched: boolean;
  ministry: string;
  ministryKey: string;     // normalized form the ministry rules are tested against
  ministryMatched: boolean;
  accountNumber: number;   // what the row resolves to right now
  tagId: number;
};

// Per-row picks made in the step 2 halt panel, keyed by FlaggedRow.row. They
// win over the rules and clear the row's flag.
export type RowOverrides = Record<number, { accountNumber?: number; tagId?: number }>;

export const APLOS_IMPORT_HEADER = [
  "Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Ministry",
];

export function transform(csvText: string, rules: CreditCardRules, lookups: AplosLookups): TransformResult {
  const rows = parseCsv(csvText.replace(/^﻿/, ""));
  const hdrIdx = rows.findIndex((r) => r[0] && r[0].trim() === "Cardholder Name");
  if (hdrIdx === -1) throw new Error('Could not find header row starting with "Cardholder Name"');
  const header = rows[hdrIdx];
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };

  const out: (string | number)[][] = [APLOS_IMPORT_HEADER];
  const warnings: string[] = [];

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 4) continue;
    const cardholder = col(r, "Cardholder Name");
    const tranDate = col(r, "Transaction Date");
    const merchant = col(r, "Merchant Name");
    const amountRaw = col(r, "Amount");
    const expenseType = col(r, "Expense Type");
    const ministry = col(r, "Ministry / Ministry Event");

    if (cardholder.toLowerCase() === "total") continue;
    if (!amountRaw && !merchant) continue;
    const amount = parseAmount(amountRaw);
    if (!isFinite(amount)) continue;

    const acctNum = classifyExpense(expenseType, rules.expense);
    if (acctNum == null)
      warnings.push(`row ${i + 1}: unknown expense type "${expenseType}" — defaulting to ${DEFAULT_ACCOUNT}`);
    const acct = acctNum ?? DEFAULT_ACCOUNT;
    const acctStr = `${acct} - ${lookups.accountName(acct)}`;

    // Tag: try ministry column first. If it's missing or resolved to the
    // catch-all General tag, fall back to the expense-type text — event
    // keywords like "mothers day" are often written there instead.
    let resolved = classifyMinistry(ministry, rules.ministry);
    const isWeak = !resolved || (resolved.tagId === DEFAULT_TAG_ID && resolved.fundId === DEFAULT_FUND_ID);
    if (isWeak) {
      const fromExpense = classifyMinistry(expenseType, rules.ministry);
      if (fromExpense && fromExpense.tagId !== DEFAULT_TAG_ID) resolved = fromExpense;
    }
    const fundId = resolved?.fundId ?? DEFAULT_FUND_ID;
    const tagId  = resolved?.tagId  ?? DEFAULT_TAG_ID;

    const inverted = +(-amount).toFixed(2);
    const cleanedMerchant = cleanMerchant(merchant, rules.merchant);
    const cardholderTitle = titleCase(cardholder);
    const memoBase = [cleanedMerchant, expenseType].filter(Boolean).join(" — ");
    const memo = cardholderTitle ? `${memoBase} (${cardholderTitle})` : memoBase;
    const payee = cleanedMerchant || cardholderTitle || "Credit Card";

    out.push([
      fmtDate(tranDate),
      memo,
      payee,
      "",
      acctStr,
      lookups.fundName(fundId),
      "",
      inverted,
      lookups.tagName(tagId),
    ]);
  }
  return { rows: out, warnings };
}

// Column names the expense-report template leaves blank for us to fill in.
export const FINAL_EXPENSE_COL = "Accountant Use: Final Expense Type";
export const FINAL_MINISTRY_COL = "Accountant Use: Final Ministry Type";

// Same row-by-row classification as transform(), but returns the sheet the
// user uploaded — every original column, one row per record, same order —
// with the two "Accountant Use" columns filled in. Rows the import would skip
// (blank lines, the "Total" trailer) keep their position with empty cells so
// the sheet still lines up against the original.
export function resolveReport(
  csvText: string,
  rules: CreditCardRules,
  lookups: AplosLookups,
  overrides: RowOverrides = {},
): TransformResult & { flagged: FlaggedRow[] } {
  const rows = parseCsv(csvText.replace(/^﻿/, ""));
  const hdrIdx = rows.findIndex((r) => r[0] && r[0].trim() === "Cardholder Name");
  if (hdrIdx === -1) throw new Error('Could not find header row starting with "Cardholder Name"');
  const header = [...rows[hdrIdx]];
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };

  // Reuse the template's columns when present; append them otherwise.
  let expenseOut = header.indexOf(FINAL_EXPENSE_COL);
  if (expenseOut === -1) { header.push(FINAL_EXPENSE_COL); expenseOut = header.length - 1; }
  let ministryOut = header.indexOf(FINAL_MINISTRY_COL);
  if (ministryOut === -1) { header.push(FINAL_MINISTRY_COL); ministryOut = header.length - 1; }

  const out: (string | number)[][] = [header];
  const warnings: string[] = [];
  const flagged: FlaggedRow[] = [];

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const row: (string | number)[] = header.map((_, idx) => r[idx] ?? "");

    const cardholder = col(r, "Cardholder Name");
    const merchant = col(r, "Merchant Name");
    const amountRaw = col(r, "Amount");
    const expenseType = col(r, "Expense Type");
    const ministry = col(r, "Ministry / Ministry Event");

    const skip =
      r.length < 4 ||
      cardholder.toLowerCase() === "total" ||
      (!amountRaw && !merchant) ||
      !isFinite(parseAmount(amountRaw));
    if (skip) {
      row[expenseOut] = "";
      row[ministryOut] = "";
      out.push(row);
      continue;
    }

    const override = overrides[i + 1] ?? {};

    const acctNum = override.accountNumber ?? classifyExpense(expenseType, rules.expense);
    if (acctNum == null)
      warnings.push(`row ${i + 1}: unknown expense type "${expenseType}" — defaulting to ${DEFAULT_ACCOUNT}`);
    const acct = acctNum ?? DEFAULT_ACCOUNT;

    // Blank or unknown ministry text is flagged even when the expense-type
    // fallback below finds a tag — the treasurer has to confirm it.
    const fromMinistry = classifyMinistry(ministry, rules.ministry);
    const ministryMatched = override.tagId != null || fromMinistry != null;
    let resolved = fromMinistry;
    const isWeak = !resolved || (resolved.tagId === DEFAULT_TAG_ID && resolved.fundId === DEFAULT_FUND_ID);
    if (isWeak) {
      const fromExpense = classifyMinistry(expenseType, rules.ministry);
      if (fromExpense && fromExpense.tagId !== DEFAULT_TAG_ID) resolved = fromExpense;
    }
    const tagId = override.tagId ?? resolved?.tagId ?? DEFAULT_TAG_ID;

    if (acctNum == null || !ministryMatched) {
      flagged.push({
        row: i + 1,
        date: col(r, "Transaction Date"),
        cardholder,
        merchant,
        amount: amountRaw,
        expenseType,
        expenseKey: norm(expenseType),
        expenseMatched: acctNum != null,
        ministry,
        ministryKey: norm(ministry),
        ministryMatched,
        accountNumber: acct,
        tagId,
      });
    }

    row[expenseOut] = `${acct} - ${lookups.accountName(acct)}`;
    row[ministryOut] = lookups.tagName(tagId);
    out.push(row);
  }
  return { rows: out, warnings, flagged };
}

// ── Aplos import from an edited resolved report ──────────────────────────────

// The resolved report carries a final *tag* but no fund, so the fund has to be
// recovered from the tag. Ministry rules already pair the two; first rule wins
// (they arrive in priority DESC order) so a tag reused across rules resolves
// the same way classifyMinistry() would have.
export function buildTagFundMap(ministry: MinistryRule[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of ministry) if (!m.has(r.tagId)) m.set(r.tagId, r.fundId);
  return m;
}

// A child tag with no rule of its own (e.g. "Youth - Nationals") takes its
// parent's fund, so new sub-tags in Aplos don't silently land in General.
export function fundForTag(
  tagId: number,
  tagFund: Map<number, number>,
  tagParentId: (id: number) => number | null,
): number {
  for (let t: number | null = tagId; t != null; t = tagParentId(t)) {
    const f = tagFund.get(t);
    if (f != null) return f;
  }
  return DEFAULT_FUND_ID;
}

// Step 3 of the flow. Unlike transform(), this trusts the two "Accountant Use"
// columns the treasurer reviewed and edited — rules are consulted only to fill
// a cell they left blank, and to map the final tag back to a fund.
export function transformFromResolved(
  grid: string[][],
  rules: CreditCardRules,
  lookups: ReverseLookups,
): TransformResult {
  const hdrIdx = grid.findIndex((r) => r[0] && r[0].trim() === "Cardholder Name");
  if (hdrIdx === -1) throw new Error('Could not find header row starting with "Cardholder Name"');
  const header = grid[hdrIdx].map((h) => (h ?? "").trim());
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };

  const expenseIn = header.indexOf(FINAL_EXPENSE_COL);
  const ministryIn = header.indexOf(FINAL_MINISTRY_COL);
  if (expenseIn === -1 && ministryIn === -1) {
    throw new Error(
      `This sheet has neither "${FINAL_EXPENSE_COL}" nor "${FINAL_MINISTRY_COL}". ` +
      `Run it through the Resolved Report step first, then upload that file here.`,
    );
  }

  const tagFund = buildTagFundMap(rules.ministry);
  const out: (string | number)[][] = [APLOS_IMPORT_HEADER];
  const warnings: string[] = [];

  for (let i = hdrIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.length < 4) continue;
    const cardholder = col(r, "Cardholder Name");
    const tranDate = col(r, "Transaction Date");
    const merchant = col(r, "Merchant Name");
    const amountRaw = col(r, "Amount");
    const expenseType = col(r, "Expense Type");
    const ministry = col(r, "Ministry / Ministry Event");

    if (cardholder.toLowerCase() === "total") continue;
    if (!amountRaw && !merchant) continue;
    const amount = parseAmount(amountRaw);
    if (!isFinite(amount)) continue;

    // Account — from the reviewed column, falling back to the rules only when
    // the cell is empty.
    const finalExpense = expenseIn >= 0 ? (r[expenseIn] ?? "").trim() : "";
    let acct: number;
    if (finalExpense) {
      const parsed = lookups.accountNumberFromLabel(finalExpense);
      if (parsed == null) {
        warnings.push(`row ${i + 1}: "${finalExpense}" is not a known Aplos account — using ${DEFAULT_ACCOUNT}`);
        acct = DEFAULT_ACCOUNT;
      } else {
        acct = parsed;
      }
    } else {
      const fromRules = classifyExpense(expenseType, rules.expense);
      if (fromRules == null)
        warnings.push(`row ${i + 1}: no final expense account and no rule for "${expenseType}" — using ${DEFAULT_ACCOUNT}`);
      else
        warnings.push(`row ${i + 1}: final expense account blank — classified "${expenseType}" as ${fromRules}`);
      acct = fromRules ?? DEFAULT_ACCOUNT;
    }

    // Tag — same deal. Fund is derived from whichever tag we land on.
    const finalMinistry = ministryIn >= 0 ? (r[ministryIn] ?? "").trim() : "";
    let tagId: number;
    let fundId: number | null = null;
    if (finalMinistry) {
      const parsed = lookups.tagIdFromLabel(finalMinistry);
      if (parsed == null) {
        warnings.push(`row ${i + 1}: "${finalMinistry}" is not a known Aplos ministry tag — using the General tag`);
        tagId = DEFAULT_TAG_ID;
      } else {
        tagId = parsed;
      }
    } else {
      let resolved = classifyMinistry(ministry, rules.ministry);
      const isWeak = !resolved || (resolved.tagId === DEFAULT_TAG_ID && resolved.fundId === DEFAULT_FUND_ID);
      if (isWeak) {
        const fromExpense = classifyMinistry(expenseType, rules.ministry);
        if (fromExpense && fromExpense.tagId !== DEFAULT_TAG_ID) resolved = fromExpense;
      }
      warnings.push(`row ${i + 1}: final ministry blank — classified "${ministry || expenseType}" from rules`);
      tagId = resolved?.tagId ?? DEFAULT_TAG_ID;
      fundId = resolved?.fundId ?? null;
    }
    fundId ??= fundForTag(tagId, tagFund, lookups.tagParentId);

    const inverted = +(-amount).toFixed(2);
    const cleanedMerchant = cleanMerchant(merchant, rules.merchant);
    const cardholderTitle = titleCase(cardholder);
    const memoBase = [cleanedMerchant, expenseType].filter(Boolean).join(" — ");
    const memo = cardholderTitle ? `${memoBase} (${cardholderTitle})` : memoBase;
    const payee = cleanedMerchant || cardholderTitle || "Credit Card";

    out.push([
      fmtDate(tranDate),
      memo,
      payee,
      "",
      `${acct} - ${lookups.accountName(acct)}`,
      lookups.fundName(fundId),
      "",
      inverted,
      lookups.tagName(tagId),
    ]);
  }
  return { rows: out, warnings };
}
