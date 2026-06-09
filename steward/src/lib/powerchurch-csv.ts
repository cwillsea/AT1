import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pdfBufferToText } from "./pdf-worker";

// One row from the "split" table under each Journal-Report entry header.
export type PCLine = {
  accountCode: string;   // "01-1110" (fund-prefix + account)
  accountName: string;   // "CHECKING ACCT"
  memo: string;          // optional 5th column (e.g. "Operations Pastor Housing")
  debit: number;
  credit: number;
};

// One Journal-Report entry: an AP check, an ACH, a payroll Direct Deposit, etc.
export type PCEntry = {
  id: string;            // synthesized stable key
  reference: string;     // "ACH" | "Direct Deposit" | "9388" | "9403-VOID"
  date: string;          // YYYY-MM-DD
  journal: string;       // "AP" | "PR"
  month: string;         // "May 2026"
  payee: string;
  lines: PCLine[];
  totalDebit: number;
  totalCredit: number;
  amount: number;        // = totalDebit (== totalCredit for balanced entries)
  isVoid: boolean;
  from: string;
  posted: string;
};

// Standard CSV parser — handles quoted fields with embedded commas (e.g. "1,537.30").
function parseCsv(text: string): string[][] {
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
      else if (c === "\r") {
        if (text[i + 1] !== "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const amount = (s: string): number => {
  const cleaned = (s ?? "").replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const mdyToIso = (mdy: string): string => {
  const m = mdy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

function parsePowerChurchCsv(text: string, fileName: string): PCEntry[] {
  const rows = parseCsv(text);
  const entries: PCEntry[] = [];
  let current: PCEntry | null = null;

  const flush = () => {
    if (current) {
      current.totalDebit = current.lines.reduce((s, l) => s + l.debit, 0);
      current.totalCredit = current.lines.reduce((s, l) => s + l.credit, 0);
      // The card's `amount` is the *cash impact* — what actually moves through
      // checking — not the journal's totalDebit. They differ for payroll: a
      // $1692.30 paycheck only sends $1537.30 to checking; $155 stays in
      // Federal Withholding (a liability accrual on the same side). Using
      // cash impact lets the user enter splits that sum cleanly: salary +
      // housing − withholding = net cash out.
      const cashLines = current.lines.filter((l) => /-1110(?:-\d+)?$/.test(l.accountCode));
      const cashOut = cashLines.reduce((s, l) => s + l.credit, 0);
      const cashIn = cashLines.reduce((s, l) => s + l.debit, 0);
      const cashImpact = current.isVoid ? cashIn - cashOut : cashOut - cashIn;
      current.amount = Math.abs(cashImpact) > 0 ? Math.abs(cashImpact) : current.totalDebit;
      entries.push(current);
      current = null;
    }
  };

  for (const r of rows) {
    const col = (i: number) => (r[i] ?? "").trim();
    const c0 = col(0), c2 = col(2), c3 = col(3), c4 = col(4), c6 = col(6), c8 = col(8), c9 = col(9);

    // Final "Totals" row terminates the report.
    if (c4 === "Totals") { flush(); continue; }

    // Footer line: "From: ... on <date> by <user>".
    if (c0.startsWith("From:")) {
      if (current) {
        current.from = c0;
        current.posted = c9;
      }
      continue;
    }

    // Entry header: column 2 is a MM/DD/YYYY date.
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c2)) {
      flush();
      const isoDate = mdyToIso(c2);
      current = {
        id: `${fileName}|${c0}|${isoDate}|${entries.length}`,
        reference: c0,
        date: isoDate,
        journal: c3,
        month: c4,
        payee: c6,
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
        amount: 0,
        isVoid: c0.toUpperCase().includes("VOID"),
        from: "",
        posted: "",
      };
      continue;
    }

    // Split line: account code in col 0 like "01-1110" or "01-5071-001".
    if (current && /^\d{2}-\d{4}/.test(c0)) {
      current.lines.push({
        accountCode: c0,
        accountName: c2,
        memo: c4,
        debit: amount(c8),
        credit: amount(c9),
      });
      continue;
    }
    // Anything else (banner rows, blanks) is ignored.
  }

  flush();
  return entries;
}

// Classify a split amount as debit vs credit when the source doesn't tell us
// (i.e. plain-text PDF extraction). Uses the church's chart-of-accounts ranges:
//   1xxx + 2xxx → assets/liabilities → credit on payout
//   3xxx + 4xxx → equity/income      → credit
//   5xxx + 6xxx → expenses           → debit
// VOID entries flip the sign.
function classifyDebitCredit(accountCode: string, amount: number, isVoid: boolean): { debit: number; credit: number } {
  const m = accountCode.match(/^\d{2}-(\d{4})/);
  if (!m) return { debit: 0, credit: amount };
  const acct = parseInt(m[1], 10);
  let isDebit = acct >= 5000;
  if (isVoid) isDebit = !isDebit;
  return isDebit ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };
}

// Parse text extracted from a PowerChurch Journal Report PDF (via pdf-parse).
// Layout per entry:
//   <reference> MM/DD/YYYY (AP|PR) <Month> <YYYY> <payee>
//   <NN-NNNN[-NNN]> <account name (and optional memo)> <amount>
//   ...more split lines...
//   From: ... Posted: ...
// Debit vs credit is inferred from the account-number range since the PDF
// columns collapse during text extraction.
function parsePowerChurchPdfText(text: string, fileName: string): PCEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: PCEntry[] = [];
  let current: PCEntry | null = null;

  const flush = () => {
    if (current) {
      current.totalDebit = current.lines.reduce((s, l) => s + l.debit, 0);
      current.totalCredit = current.lines.reduce((s, l) => s + l.credit, 0);
      current.amount = current.totalDebit;
      entries.push(current);
      current = null;
    }
  };

  // Recognised month names for header parsing.
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

  for (const raw of lines) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line) continue;
    if (/^Totals\b/i.test(line)) { flush(); continue; }
    if (/^All Dates\b/i.test(line)) continue;
    if (/^Reference\s+Date\s+Journal\b/i.test(line)) continue;
    if (/^Page:\s*\d+/i.test(line)) continue;
    if (/^After the One Church$/i.test(line)) continue;
    if (/^Journal Report$/i.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM)/i.test(line)) continue; // report timestamp

    if (line.startsWith("From:")) {
      if (current) {
        const postedIdx = line.indexOf("Posted:");
        if (postedIdx > 0) {
          current.from = line.slice(0, postedIdx).trim();
          current.posted = line.slice(postedIdx).trim();
        } else {
          current.from = line;
        }
      }
      continue;
    }

    // Entry header: "<ref> MM/DD/YYYY (AP|PR) <Month> <YYYY> <payee>"
    const headerRe = new RegExp(
      `^(.+?)\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(AP|PR)\\s+(${MONTHS})\\s+(\\d{4})\\s+(.+?)$`,
      "i",
    );
    const h = line.match(headerRe);
    if (h) {
      flush();
      const reference = h[1].trim();
      const isoDate = mdyToIso(h[2]);
      current = {
        id: `${fileName}|${reference}|${isoDate}|${entries.length}`,
        reference,
        date: isoDate,
        journal: h[3].toUpperCase(),
        month: `${h[4]} ${h[5]}`,
        payee: h[6].trim(),
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
        amount: 0,
        isVoid: reference.toUpperCase().includes("VOID"),
        from: "",
        posted: "",
      };
      continue;
    }

    // Split line: "<NN-NNNN[-NNN]> <name [memo]> <amount>"
    const lm = line.match(/^(\d{2}-\d{4}(?:-\d+)?)\s+(.+?)\s+([\d,]+\.\d{2})$/);
    if (lm && current) {
      const accountCode = lm[1];
      const rest = lm[2].trim();
      const amt = amount(lm[3]);
      const { debit, credit } = classifyDebitCredit(accountCode, amt, current.isVoid);
      current.lines.push({
        accountCode,
        accountName: rest,
        memo: "", // PDF extraction can't reliably split name from memo
        debit,
        credit,
      });
      continue;
    }
  }
  flush();
  return entries;
}

const PC_DIR = path.resolve(process.cwd(), "..", "powerchurch");

export function getPowerChurchDir(): string {
  return PC_DIR;
}

export async function loadAllPowerChurchEntries(): Promise<{ sourcePaths: string[]; entries: PCEntry[] }> {
  let dirEntries: string[];
  try {
    dirEntries = readdirSync(PC_DIR);
  } catch {
    return { sourcePaths: [], entries: [] };
  }

  const all: PCEntry[] = [];
  const sourcePaths: string[] = [];

  for (const f of dirEntries) {
    const lower = f.toLowerCase();
    const p = path.join(PC_DIR, f);
    if (lower.endsWith(".csv")) {
      sourcePaths.push(p);
      all.push(...parsePowerChurchCsv(readFileSync(p, "utf8"), f));
    } else if (lower.endsWith(".pdf")) {
      sourcePaths.push(p);
      try {
        const text = await pdfBufferToText(readFileSync(p));
        all.push(...parsePowerChurchPdfText(text, f));
      } catch {
        // Skip files that fail to parse — bad uploads, etc.
      }
    }
  }

  // Dedupe across files by reference + date + amount + payee.
  const seen = new Set<string>();
  const deduped = all.filter((e) => {
    const k = `${e.reference}|${e.date}|${e.amount.toFixed(2)}|${e.payee}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  deduped.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { sourcePaths, entries: deduped };
}
