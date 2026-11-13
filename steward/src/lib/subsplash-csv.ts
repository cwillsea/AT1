import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type GiftRow = {
  transactionDate: string;
  transactionTimestamp: string;
  transferId: string;
  transferDate: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  grossAmount: number;
  fee: number;
  netAmount: number;
  donorCoveredFee: string;
  fund: string;
  paymentMethod: string;
  memo: string;
  giftId: string;
};

export type PaymentRow = {
  transactionDate: string;
  transactionTimestamp: string;
  transferId: string;
  transferDate: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  grossAmount: number;
  fee: number;
  netAmount: number;
  fund: string;
  paymentSource: string; // "Academy Pizza Wednesday", "Youth Camp", etc.
  paymentMethod: string;
  paymentId: string;
};

export type GiftRollup = { fund: string; count: number; gross: number; fee: number; net: number };
export type PaymentRollup = { paymentSource: string; count: number; gross: number; fee: number; net: number };

export type Transfer = {
  id: string;             // transferId
  transferDate: string;   // YYYY-MM-DD
  transferAmount: number; // total bank deposit (sum of row net amounts — the export has no separate total)
  giftCount: number;
  paymentCount: number;
  giftsTotalNet: number;
  giftsTotalFees: number;
  paymentsTotalNet: number;
  paymentsTotalFees: number;
  gifts: GiftRow[];
  payments: PaymentRow[];
  giftRollup: GiftRollup[];
  paymentRollup: PaymentRollup[];
};

// Standard CSV parser that handles quoted fields, embedded commas, escaped quotes.
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
        // bare CR (old Mac) acts as line terminator; CRLF: the \n will follow and push an empty row which gets filtered
        if (text[i + 1] !== "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return { header, rows: rows.filter((r) => r.length === header.length) };
}

// Excel/Subsplash exports may start with a UTF-8 byte-order mark.
export const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : 0;
};

// Subsplash's transfer export is a single CSV per transfer (transfer-<id>.csv)
// with gifts and payments interleaved, told apart by the "Transaction Type"
// column. Header names are Title Case (e.g. "Gross Amount", "Email Address").
// Older exports split these into separate gifts-*.csv / payments-*.csv files
// with different headers — those are no longer supported and are ignored.
const REQUIRED_HEADERS = ["Transfer ID", "Transaction Type", "Gross Amount", "Net Amount"];

export function isTransferCsv(header: string[]): boolean {
  return REQUIRED_HEADERS.every((h) => header.includes(h));
}

function parseTransferCsv(text: string): { gifts: GiftRow[]; payments: PaymentRow[] } {
  const { header, rows } = parseCsv(stripBom(text));
  const gifts: GiftRow[] = [];
  const payments: PaymentRow[] = [];
  if (!isTransferCsv(header)) return { gifts, payments };

  for (const r of rows) {
    const o = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>;
    const base = {
      transactionDate: o["Transaction Date"],
      transactionTimestamp: o["Transaction Timestamp"],
      transferId: o["Transfer ID"],
      transferDate: o["Transfer Date"],
      status: o["Status"],
      firstName: o["First Name"],
      lastName: o["Last Name"],
      email: o["Email Address"],
      grossAmount: num(o["Gross Amount"]),
      fee: num(o["Fee"]),
      netAmount: num(o["Net Amount"]),
      fund: o["Fund"],
      paymentMethod: o["Payment Method"],
    };
    const type = (o["Transaction Type"] ?? "").trim().toLowerCase();
    // "Gift" and "Payment" are the only types seen so far. For anything else
    // (e.g. a refund type), route by shape so the row isn't silently dropped:
    // a row with a Fund is giving, a row with a Source is a payment.
    const isGift = type === "gift" || (type !== "payment" && !!o["Fund"] && !o["Source"]);
    if (isGift) {
      gifts.push({
        ...base,
        donorCoveredFee: (o["Covered Fee"] ?? "").toLowerCase(),
        memo: o["Memo"],
        giftId: o["Transaction ID"],
      });
    } else {
      payments.push({
        ...base,
        paymentSource: o["Source"],
        paymentId: o["Transaction ID"],
      });
    }
  }
  return { gifts, payments };
}

const TRANSFERS_DIR = path.resolve(process.cwd(), "..", "subsplash", "transfers");

export function getTransfersDir(): string {
  return TRANSFERS_DIR;
}

// Pull the distinct non-empty "Transfer ID" values out of a transfer export
// CSV. Used by the upload route to un-delete transfers when their file is
// reuploaded (a stale DeletedDeposit soft-delete would otherwise keep them hidden).
export function extractTransferIds(csvText: string): string[] {
  const { header, rows } = parseCsv(csvText);
  const idx = header.indexOf("Transfer ID");
  if (idx === -1) return [];
  const ids = new Set<string>();
  for (const r of rows) {
    const id = r[idx];
    if (id) ids.add(id);
  }
  return [...ids];
}

// Reads every transfer export CSV in subsplash/transfers/ and groups rows by
// Transfer ID. Files without the combined-export header (e.g. legacy
// gifts-*/payments-* exports) are skipped.
export function loadAllTransfers(): { csvPaths: string[]; transfers: Transfer[] } {
  let entries: string[];
  try {
    entries = readdirSync(TRANSFERS_DIR);
  } catch {
    throw new Error(`No subsplash/transfers directory at ${TRANSFERS_DIR}`);
  }

  const allGifts: GiftRow[] = [];
  const allPayments: PaymentRow[] = [];
  const csvPaths: string[] = [];

  for (const f of entries.filter((f) => /\.csv$/i.test(f))) {
    const p = path.join(TRANSFERS_DIR, f);
    const { gifts, payments } = parseTransferCsv(readFileSync(p, "utf8"));
    if (gifts.length === 0 && payments.length === 0) continue;
    csvPaths.push(p);
    allGifts.push(...gifts);
    allPayments.push(...payments);
  }

  // Dedupe by Gift ID / Payment ID (in case of overlapping uploads)
  const seenGifts = new Set<string>();
  const dedupedGifts = allGifts.filter((g) => {
    // Include grossAmount: Subsplash reuses the same Gift ID when one donor gives to multiple
    // funds in a single session, so giftId alone isn't unique across split donations.
    const k = g.giftId
      ? `${g.giftId}|${g.grossAmount}`
      : `${g.transferId}|${g.transactionTimestamp}|${g.email}|${g.grossAmount}`;
    if (seenGifts.has(k)) return false;
    seenGifts.add(k);
    return true;
  });
  const seenPayments = new Set<string>();
  const dedupedPayments = allPayments.filter((p) => {
    // Include grossAmount: Subsplash reuses the same Payment ID for a refund of a
    // payment (the refund row carries the negative of the original amount), so
    // paymentId alone would collide the payment with its refund and drop one.
    const k = p.paymentId
      ? `${p.paymentId}|${p.grossAmount}`
      : `${p.transferId}|${p.transactionTimestamp}|${p.email}|${p.grossAmount}`;
    if (seenPayments.has(k)) return false;
    seenPayments.add(k);
    return true;
  });

  // Refund rows arrive with a blank Payment source but reuse the original
  // payment's Payment ID (and carry the negated gross/fee/net). Inherit the
  // original payment's source so the refund reverses the same income
  // account/fund/tag — and its negative fee reverses the original fee — instead
  // of landing as an unmatched "(no source)" line. Falls back to blank when the
  // original payment isn't among the loaded files.
  const sourceByPaymentId = new Map<string, string>();
  for (const p of dedupedPayments) {
    if (p.paymentId && p.paymentSource && !sourceByPaymentId.has(p.paymentId)) {
      sourceByPaymentId.set(p.paymentId, p.paymentSource);
    }
  }
  for (const p of dedupedPayments) {
    if (!p.paymentSource && p.paymentId) {
      const original = sourceByPaymentId.get(p.paymentId);
      if (original) p.paymentSource = original;
    }
  }

  // Group by transferId
  const byId = new Map<string, Transfer>();
  const ensure = (id: string, transferDate: string): Transfer => {
    if (!byId.has(id)) {
      byId.set(id, {
        id, transferDate, transferAmount: 0,
        giftCount: 0, paymentCount: 0,
        giftsTotalNet: 0, giftsTotalFees: 0,
        paymentsTotalNet: 0, paymentsTotalFees: 0,
        gifts: [], payments: [],
        giftRollup: [], paymentRollup: [],
      });
    }
    return byId.get(id)!;
  };

  for (const g of dedupedGifts) {
    if (!g.transferId) continue;
    const t = ensure(g.transferId, g.transferDate);
    t.gifts.push(g);
    t.giftCount += 1;
    t.giftsTotalNet += g.netAmount;
    t.giftsTotalFees += g.fee;
  }
  for (const p of dedupedPayments) {
    if (!p.transferId) continue;
    const t = ensure(p.transferId, p.transferDate);
    t.payments.push(p);
    t.paymentCount += 1;
    t.paymentsTotalNet += p.netAmount;
    t.paymentsTotalFees += p.fee;
  }

  for (const t of byId.values()) {
    // The combined export has no "Transfer amount" column; the deposit is the
    // sum of every row's net amount.
    t.transferAmount = Math.round((t.giftsTotalNet + t.paymentsTotalNet) * 100) / 100;

    // Rollups
    const giftMap = new Map<string, GiftRollup>();
    for (const g of t.gifts) {
      const existing = giftMap.get(g.fund);
      if (existing) {
        existing.count += 1;
        existing.gross += g.grossAmount;
        existing.fee += g.fee;
        existing.net += g.netAmount;
      } else {
        giftMap.set(g.fund, { fund: g.fund || "(no fund)", count: 1, gross: g.grossAmount, fee: g.fee, net: g.netAmount });
      }
    }
    t.giftRollup = [...giftMap.values()].sort((a, b) => b.net - a.net);

    const payMap = new Map<string, PaymentRollup>();
    for (const p of t.payments) {
      const k = p.paymentSource || "(no source)";
      const existing = payMap.get(k);
      if (existing) {
        existing.count += 1;
        existing.gross += p.grossAmount;
        existing.fee += p.fee;
        existing.net += p.netAmount;
      } else {
        payMap.set(k, { paymentSource: k, count: 1, gross: p.grossAmount, fee: p.fee, net: p.netAmount });
      }
    }
    t.paymentRollup = [...payMap.values()].sort((a, b) => b.net - a.net);
  }

  const transfers = [...byId.values()].sort((a, b) =>
    a.transferDate < b.transferDate ? 1 : a.transferDate > b.transferDate ? -1 : 0
  );

  return { csvPaths, transfers };
}
