// Pure parser + classifier for Truist ACH payroll exports. No node:fs imports —
// safe to import from client components. See payroll-csv-server.ts for the
// filesystem loader used by server pages.
//
// The export is a header row followed by one "batch" row per ACH (has a
// Tracking ID, total Amount, Effective Date) and, under each, one row per
// recipient (blank Tracking ID, Recipient Payment Amount + Recipient Name).

export type PayrollRecipient = {
  name: string;          // "Recipient Name" — what rules match on
  achName: string;       // "Recipient ACH Name" — shown when it differs
  amount: number;
  accountLast4: string;  // never keep the full account number around
};

export type ClassifiedRecipient = PayrollRecipient & {
  accountNumber: number;
  fundId: number;
  tagId: number;
};

export type PayrollBatch = {
  id: string;            // "payroll:<trackingId>" — ManualMark / DeletedDeposit key
  trackingId: string;
  status: string;
  createdDate: string;   // YYYY-MM-DD
  effectiveDate: string; // YYYY-MM-DD — the day the bank debits
  amount: number;        // batch total from the bank
  description: string;
  fromAccount: string;
  recipients: ClassifiedRecipient[];
};

// source="payroll" CategorizationRule, exact (case-insensitive) on Recipient Name.
export type PayrollRule = {
  id: number;
  pattern: string;
  accountNumber: number;
  fundId: number;
  tagId: number;
};

export function parseCsv(text: string): string[][] {
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
      else if (c !== "\r") field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string | undefined) => {
  const n = parseFloat((s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// "9/10/2026" → "2026-09-10". Passes through anything it doesn't recognise.
function isoDate(s: string): string {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return (s ?? "").trim();
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function looksLikePayrollCsv(text: string): boolean {
  const header = parseCsv(text.replace(/^﻿/, ""))[0] ?? [];
  return header.includes("Tracking ID") && header.includes("Recipient Name");
}

// Batches come back unclassified (account/fund/tag = 0); run classifyBatch after.
export function parsePayrollCsv(text: string): PayrollBatch[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header?.includes("Tracking ID")) throw new Error('Missing "Tracking ID" column — not a Truist ACH payroll export?');
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };

  const batches: PayrollBatch[] = [];
  let current: PayrollBatch | null = null;
  for (const r of rows) {
    if (r.every((c) => c.trim() === "")) continue;
    const trackingId = col(r, "Tracking ID");
    if (trackingId) {
      current = {
        id: `payroll:${trackingId}`,
        trackingId,
        status: col(r, "Status"),
        createdDate: isoDate(col(r, "Created")),
        effectiveDate: isoDate(col(r, "Effective Date")),
        amount: num(col(r, "Amount")),
        description: col(r, "Description"),
        fromAccount: col(r, "From Account"),
        recipients: [],
      };
      batches.push(current);
      continue;
    }
    const name = col(r, "Recipient Name");
    if (!current || !name) continue;
    current.recipients.push({
      name,
      achName: col(r, "Recipient ACH Name"),
      amount: num(col(r, "Recipient Payment Amount")),
      accountLast4: col(r, "Recipient Account").slice(-4),
      accountNumber: 0,
      fundId: 0,
      tagId: 0,
    });
  }
  return batches;
}

export function classifyRecipient(r: PayrollRecipient, rules: PayrollRule[]): ClassifiedRecipient {
  const key = r.name.trim().toLowerCase();
  const rule = rules.find((x) => x.pattern.trim().toLowerCase() === key);
  // No rule matched — account 0 surfaces the gap instead of faking a target.
  return rule
    ? { ...r, accountNumber: rule.accountNumber, fundId: rule.fundId, tagId: rule.tagId }
    : { ...r, accountNumber: 0, fundId: 0, tagId: 0 };
}

export function classifyBatch(batch: PayrollBatch, rules: PayrollRule[]): PayrollBatch {
  return { ...batch, recipients: batch.recipients.map((r) => classifyRecipient(r, rules)) };
}

export function recipientsTotal(batch: PayrollBatch): number {
  return +batch.recipients.reduce((s, r) => s + r.amount, 0).toFixed(2);
}
