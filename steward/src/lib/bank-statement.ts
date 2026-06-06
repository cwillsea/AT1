// Parses an Enterprise Bank & Trust "Community Checking" statement PDF
// into three lists: checks, debits, credits.
//
// The text extraction from pdf-parse yields the statement as a long flat
// string. Sections we care about:
//   CHECKS  — rows of: number, MM-DD, amount (often two columns side by side)
//   DEBITS  — rows of: MM-DD, "' ACH Debit" (or similar), amount, then 1-3
//             description lines on subsequent rows
//   CREDITS — same shape as DEBITS, with "' ACH Deposit" / "Deposit" labels
//
// The statement also carries DAILY BALANCES at the end — we use the
// "This statement: <Month D, YYYY>" line to figure out the year.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

// pdf-parse / pdfjs-dist normally bootstrap their worker by doing a dynamic
// import() of GlobalWorkerOptions.workerSrc. Under Next 16 + Turbopack that
// dynamic import is still intercepted even with serverExternalPackages set,
// producing paths like "C:/.../steward/[project]/steward/node_modules/...".
//
// Escape hatch: pdfjs skips that dynamic import entirely when
// globalThis.pdfjsWorker.WorkerMessageHandler is already populated (see
// PDFWorker.#mainThreadWorkerMessageHandler in pdfjs-dist/legacy/build/pdf.mjs).
// We load pdf.worker.mjs ourselves once, via a plain require() against an
// absolute path so Turbopack doesn't touch it, and stash the handler.
let workerConfigured = false;
async function ensureWorker() {
  if (workerConfigured) return;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  const workerUrl = pathToFileURL(workerPath).href;
  // Tell pdfjs about the workerSrc even though we'll preempt the import —
  // some code paths still log/inspect the value.
  PDFParse.setWorker(workerUrl);
  // Hide the dynamic import behind `new Function` so Turbopack can't statically
  // rewrite it. Comment pragmas like webpackIgnore / @vite-ignore are NOT
  // respected by Turbopack, so we have to make the import truly opaque.
  const dynamicImport = new Function("u", "return import(u);") as (u: string) => Promise<unknown>;
  const mod = (await dynamicImport(workerUrl)) as { WorkerMessageHandler?: unknown };
  // pdfjs reads globalThis.pdfjsWorker.WorkerMessageHandler before falling back
  // to the dynamic worker import.
  (globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
    WorkerMessageHandler: mod.WorkerMessageHandler,
  };
  workerConfigured = true;
}

export type BankEntryKind = "check" | "debit" | "credit";

export type ParsedBankEntry = {
  kind: BankEntryKind;
  date: string; // YYYY-MM-DD
  amount: number; // signed: debits/checks negative, credits positive
  description: string;
  checkNumber?: number;
};

export type ParsedStatement = {
  statementMonth: string; // "May 2026"
  statementYear: number;
  entries: ParsedBankEntry[];
  summary: {
    beginningBalance: number;
    totalAdditions: number;
    totalSubtractions: number;
    endingBalance: number;
  } | null;
  warnings: string[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function parseStatementDate(text: string): { year: number; label: string } {
  // "This statement: May 31, 2026"
  const m = text.match(/This statement:\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/);
  if (m) {
    const month = m[1];
    const year = Number(m[2]);
    return { year, label: `${month} ${year}` };
  }
  return { year: new Date().getFullYear(), label: "Unknown statement" };
}

function mmddToIso(mmdd: string, year: number): string {
  const [mm, dd] = mmdd.split("-");
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseAmount(s: string): number {
  return Number(s.replace(/[,$]/g, ""));
}

// Pull the four numbers from the "Community Checking" summary box.
// Layout in the extracted text:
//   Beginning balance \t$33,830.84
//   Total additions \t47,932.56
//   Total subtractions \t48,982.92
//   Ending balance \t$32,780.48
function parseSummary(text: string): ParsedStatement["summary"] {
  const pick = (label: RegExp): number | null => {
    const m = text.match(label);
    return m ? parseAmount(m[1]) : null;
  };
  const beginningBalance = pick(/Beginning balance\s*\$?([\d,]+\.\d{2})/i);
  const totalAdditions = pick(/Total additions\s*\$?([\d,]+\.\d{2})/i);
  const totalSubtractions = pick(/Total subtractions\s*\$?([\d,]+\.\d{2})/i);
  const endingBalance = pick(/Ending balance\s*\$?([\d,]+\.\d{2})/i);
  if (
    beginningBalance === null ||
    totalAdditions === null ||
    totalSubtractions === null ||
    endingBalance === null
  ) {
    return null;
  }
  return { beginningBalance, totalAdditions, totalSubtractions, endingBalance };
}

// Parse the CHECKS section. Lines look like:
//   "9383     05-04     600.00"
// or two columns on one line:
//   "9383  05-04  600.00     9397  05-22  164.43"
// They may also have a trailing "*" marker indicating a skip in sequence:
//   "9386 *  05-06  20.98"
function parseChecks(text: string, year: number): ParsedBankEntry[] {
  const entries: ParsedBankEntry[] = [];
  // Find the CHECKS section start — between "CHECKS" and the next ALL CAPS section header.
  const m = text.match(/CHECKS\b([\s\S]*?)(?=DEBITS\b|CREDITS\b|DAILY\s+BALANCES\b)/);
  if (!m) return entries;
  const body = m[1];

  // Walk all "num [optional *] mm-dd amount" triples.
  const re = /(\d{3,5})\s*\*?\s+(\d{1,2}-\d{1,2})\s+([\d,]+\.\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const checkNumber = Number(match[1]);
    const date = mmddToIso(match[2], year);
    const amount = parseAmount(match[3]);
    entries.push({
      kind: "check",
      date,
      amount: -amount,
      description: `Check #${checkNumber}`,
      checkNumber,
    });
  }
  return entries;
}

// Parse all DEBIT + CREDIT rows in one pass.
//
// Why one pass: pdf-parse extracts text column-by-column, so the section
// boundaries the bank visually prints (DEBITS / CREDITS / DAILY BALANCES) do
// not line up with the row order in the extracted text. On a continuation
// page, debit rows can land inside the CREDITS section text, and credit rows
// can land after DAILY BALANCES. Trying to slice by section header
// misclassifies or drops rows.
//
// Instead we walk the whole transaction region row-by-row and classify each
// by the LABEL ("' ACH Debit", "' ACH Deposit", "Deposit", "Deposit Return
// Item", "' Internet/Phone Trsfr", "' Analysis Results Chg"). Daily-balance
// rows (date + amount with no alpha label) fall out via the label filter.
//
// Descriptions live in a separate column the extractor emits AFTER each
// page's row block, in row order. We collect description blocks (grouping
// continuation lines) and zip them onto rows in order, skipping rows whose
// label is "Deposit" / "Deposit Return Item" (those have no second-column
// detail in the source PDF).
function parseTransactions(text: string, year: number): ParsedBankEntry[] {
  const startIdx = text.search(/\bDEBITS\b/);
  if (startIdx < 0) return [];
  const endIdx = text.search(/Thank you for banking/);
  const body = text.slice(startIdx, endIdx > 0 ? endIdx : text.length);

  type RawRow = { start: number; end: number; kind: BankEntryKind; date: string; amount: number; label: string };
  const rows: RawRow[] = [];

  const rowRe = /(\d{1,2}-\d{1,2})\s+([^\n]*?)\s+([\d,]+\.\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(body)) !== null) {
    const label = m[2].trim();
    // Daily balances and three-column balance rows have no alpha label.
    if (!/[a-zA-Z]/.test(label)) continue;
    // Column headers like "Description Subtractions" or "Description Additions".
    if (/^(description|amount|subtractions|additions)/i.test(label)) continue;
    if (/\bdescription\b.*\b(subtractions|additions|amount)\b/i.test(label)) continue;

    const isDebit =
      /\bDebit\b/i.test(label) ||
      /Return Item/i.test(label) ||
      /Analysis/i.test(label) ||
      /Service Chg/i.test(label) ||
      /Service Charge/i.test(label);
    const amount = parseAmount(m[3]);
    rows.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: isDebit ? "debit" : "credit",
      date: mmddToIso(m[1], year),
      amount: isDebit ? -amount : amount,
      label,
    });
  }

  // Collect description lines from the gaps between matched rows (this picks
  // up the description column block that follows each page's rows).
  const descLines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const after = rows[i].end;
    const before = i + 1 < rows.length ? rows[i + 1].start : body.length;
    const gap = body.slice(after, before);
    for (const raw of gap.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^FREEDOM FAMILY CHURCH/i.test(line)) continue;
      if (/^May \d{1,2}, \d{4}/.test(line)) continue;
      if (/^XXXXXX\d+/.test(line)) continue;
      if (/^Page \d+/i.test(line)) continue;
      if (/^(CHECKS|DEBITS|CREDITS)\b/.test(line)) continue;
      if (/^DAILY\s+BALANCES?\b/i.test(line)) continue;
      if (/^Date\b/i.test(line) && /\b(Amount|Description|Subtractions|Additions)\b/i.test(line)) continue;
      // pdf-parse emits page-break markers like "-- 2 of 9 --" between pages.
      if (/^-+\s*\d+\s+of\s+\d+\s*-+$/i.test(line)) continue;
      // Daily-balance values that leak into the description gap have no alpha.
      if (!/[a-zA-Z]/.test(line)) continue;
      descLines.push(line);
    }
  }

  // Continuation lines: reference codes / addresses that belong to the
  // previous primary description (e.g. "202739301460", "6semk8m0kdk",
  // "X5T9H4F3G1P3", "FROM FUNDS TRANSFER VIA ONLINE").
  const isContinuation = (line: string): boolean => {
    if (line.length < 6) return false;
    if (/\s/.test(line)) return /^(FROM|VIA|TO)\s/i.test(line);
    if (/^\d+$/.test(line)) return true;
    if (/^[a-z0-9]+$/.test(line)) return true;
    if (/^\d[\dA-Z]+$/.test(line)) return true;
    if (/^[A-Z][\dA-Z]*\d[\dA-Z]*$/.test(line) && line.length >= 8) return true;
    return false;
  };
  const blocks: string[] = [];
  for (const line of descLines) {
    if (blocks.length > 0 && isContinuation(line)) {
      blocks[blocks.length - 1] += " " + line;
    } else {
      blocks.push(line);
    }
  }

  // Zip blocks onto rows. Rows labeled "Deposit" / "Deposit Return Item"
  // have no detail column in the source, so they do not consume a block.
  const entries: ParsedBankEntry[] = [];
  let bi = 0;
  for (const row of rows) {
    const labelOnly = /^Deposit$/i.test(row.label) || /^Deposit Return Item$/i.test(row.label);
    let description = row.label;
    if (!labelOnly && bi < blocks.length) {
      description = `${row.label} — ${blocks[bi]}`;
      bi++;
    }
    entries.push({ kind: row.kind, date: row.date, amount: row.amount, description });
  }
  return entries;
}

export async function parseStatementBuffer(buffer: Buffer): Promise<ParsedStatement> {
  await ensureWorker();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let text: string;
  try {
    const result = await parser.getText();
    text = result.text;
  } finally {
    await parser.destroy();
  }

  const { year, label } = parseStatementDate(text);
  const warnings: string[] = [];

  const checks = parseChecks(text, year);
  const txns = parseTransactions(text, year);
  const debits = txns.filter((e) => e.kind === "debit");
  const credits = txns.filter((e) => e.kind === "credit");

  if (checks.length === 0 && debits.length === 0 && credits.length === 0) {
    warnings.push("No checks, debits, or credits were parsed — the statement format may not match the Enterprise Bank & Trust layout.");
  }

  const summary = parseSummary(text);
  if (!summary) warnings.push("Could not parse the statement summary (Beginning/Ending balance, Total additions/subtractions).");

  return {
    statementMonth: label,
    statementYear: year,
    entries: [...checks, ...txns],
    summary,
    warnings,
  };
}

// Stable key for the BankEntry row in the DB.
//   bank:May 2026:check:9383
//   bank:May 2026:debit:0
export function externalKeyFor(statementMonth: string, entry: ParsedBankEntry, index: number): string {
  if (entry.kind === "check" && entry.checkNumber !== undefined) {
    return `bank:${statementMonth}:check:${entry.checkNumber}`;
  }
  return `bank:${statementMonth}:${entry.kind}:${index}:${entry.date}:${entry.amount.toFixed(2)}`;
}
