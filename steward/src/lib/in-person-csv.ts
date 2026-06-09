import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// In-person gifts are exported from Subsplash as a "Contribution Batch" CSV
// (e.g. one CSV per Sunday's offering). Shape differs from the online
// gifts-*.csv: no fees, no transfer id, but adds Batch name + Check number.
export type InPersonGiftRow = {
  transactionDate: string;      // YYYY-MM-DD
  transactionTimestamp: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  grossAmount: number;          // same as net — there are no fees
  fund: string;                 // raw Fund column; may resolve to a Purpose via subsplash-gift rules
  paymentMethod: string;        // "Cash" | "Check" | etc.
  checkNumber: string;
  memo: string;
  batchName: string;            // "5/3/26"
  giftId: string;
  donorId: string;
};

export type InPersonGiftRollup = { fund: string; count: number; gross: number };

export type InPersonBatch = {
  id: string;             // batch name (used as the externalKey suffix)
  batchName: string;
  transactionDate: string; // earliest gift date in the batch (YYYY-MM-DD)
  giftCount: number;
  totalGross: number;     // == totalNet (no fees)
  gifts: InPersonGiftRow[];
  giftRollup: InPersonGiftRollup[];
};

// Standard CSV parser — quoted fields, embedded commas, escaped quotes.
function parseCsv(text: string): { header: string[]; rows: string[][] } {
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
      }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return { header, rows: rows.filter((r) => r.length === header.length) };
}

// In-person gross amounts arrive as "$465.00" with optional thousands commas.
const num = (s: string | undefined): number => {
  const cleaned = (s ?? "").replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function parseInPersonCsv(text: string): InPersonGiftRow[] {
  const { header, rows } = parseCsv(text);
  return rows.map((r) => {
    const o = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>;
    return {
      transactionDate: o["Transaction date"] ?? "",
      transactionTimestamp: o["Transaction timestamp"] ?? "",
      status: o["Status"] ?? "",
      firstName: o["First name"] ?? "",
      lastName: o["Last name"] ?? "",
      email: o["Email"] ?? "",
      grossAmount: num(o["Gross amount"]),
      fund: o["Fund"] ?? "",
      paymentMethod: o["Payment method"] ?? "",
      checkNumber: o["Check number"] ?? "",
      memo: o["Memo"] ?? "",
      batchName: o["Batch name"] ?? "",
      giftId: o["Gift ID"] ?? "",
      donorId: o["Donor ID"] ?? "",
    };
  });
}

const IN_PERSON_DIR = path.resolve(process.cwd(), "..", "subsplash", "in-person");

export function getInPersonDir(): string {
  return IN_PERSON_DIR;
}

export function loadAllBatches(): { csvPaths: string[]; batches: InPersonBatch[] } {
  let entries: string[];
  try {
    entries = readdirSync(IN_PERSON_DIR);
  } catch {
    return { csvPaths: [], batches: [] };
  }

  const csvFiles = entries.filter((f) => f.toLowerCase().endsWith(".csv"));
  const allGifts: InPersonGiftRow[] = [];
  const csvPaths: string[] = [];

  for (const f of csvFiles) {
    const p = path.join(IN_PERSON_DIR, f);
    csvPaths.push(p);
    allGifts.push(...parseInPersonCsv(readFileSync(p, "utf8")));
  }

  // Dedupe across CSVs by Gift ID + gross + fund (one donor can split a gift
  // across multiple funds with the same Gift ID).
  const seen = new Set<string>();
  const deduped = allGifts.filter((g) => {
    const k = g.giftId
      ? `${g.giftId}|${g.grossAmount}|${g.fund}`
      : `${g.batchName}|${g.transactionTimestamp}|${g.firstName}|${g.lastName}|${g.grossAmount}|${g.fund}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Group by Batch name.
  const byBatch = new Map<string, InPersonBatch>();
  for (const g of deduped) {
    const id = g.batchName || g.transactionDate || "(unbatched)";
    let b = byBatch.get(id);
    if (!b) {
      b = {
        id,
        batchName: id,
        transactionDate: g.transactionDate,
        giftCount: 0,
        totalGross: 0,
        gifts: [],
        giftRollup: [],
      };
      byBatch.set(id, b);
    }
    b.gifts.push(g);
    b.giftCount++;
    b.totalGross += g.grossAmount;
    // Keep the earliest transaction date as the batch's nominal date.
    if (g.transactionDate && (!b.transactionDate || g.transactionDate < b.transactionDate)) {
      b.transactionDate = g.transactionDate;
    }
  }

  // Build per-fund rollups, sorted by gross descending.
  for (const b of byBatch.values()) {
    const rollup = new Map<string, InPersonGiftRollup>();
    for (const g of b.gifts) {
      const key = g.fund || "(no fund)";
      let r = rollup.get(key);
      if (!r) {
        r = { fund: key, count: 0, gross: 0 };
        rollup.set(key, r);
      }
      r.count++;
      r.gross += g.grossAmount;
    }
    b.giftRollup = Array.from(rollup.values()).sort((a, b) => b.gross - a.gross);
  }

  const batches = Array.from(byBatch.values()).sort(
    (a, b) => (b.transactionDate || "").localeCompare(a.transactionDate || ""),
  );

  return { csvPaths, batches };
}
