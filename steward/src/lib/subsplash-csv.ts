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
  transferAmount: number; // total bank deposit (stated in legacy payments files; else sum of row net amounts)
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

// Subsplash has shipped two export formats. Each file's format is detected from
// its header row (not its filename), and both parse into the same row types:
//
//   "combined" — current (Oct 2026+): one transfer-<id>.csv per transfer with
//                gifts and payments interleaved, told apart by the
//                "Transaction Type" column. Title Case headers ("Gross Amount",
//                "Email Address", "Source", "Transaction ID"). No transfer total.
//   "legacy-gifts" / "legacy-payments" — older: separate gifts-*.csv and
//                payments-*.csv files with sentence-case headers ("Gross amount",
//                "Gift ID", "Payment source"). The payments file carries
//                "Transfer amount", the authoritative bank deposit total.
//
// Legacy support stays so transfers posted before the format change still show
// on the /subsplash shelf.
export type SubsplashCsvKind = "combined" | "legacy-gifts" | "legacy-payments";

export function detectSubsplashCsvKind(header: string[]): SubsplashCsvKind | null {
  const has = (...hs: string[]) => hs.every((h) => header.includes(h));
  if (has("Transfer ID", "Transaction Type", "Gross Amount", "Net Amount")) return "combined";
  if (has("Transfer ID", "Payment source", "Gross amount", "Net amount")) return "legacy-payments";
  if (has("Transfer ID", "Gift ID", "Gross amount", "Net amount")) return "legacy-gifts";
  return null;
}

type ParsedFile = {
  gifts: GiftRow[];
  payments: PaymentRow[];
  // Bank deposit total per transfer, when the file states one (legacy payments only).
  transferAmounts: Map<string, number>;
};

function parseSubsplashCsv(text: string): ParsedFile {
  const { header, rows } = parseCsv(stripBom(text));
  const out: ParsedFile = { gifts: [], payments: [], transferAmounts: new Map() };
  const kind = detectSubsplashCsvKind(header);
  const records = () =>
    rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>);

  if (kind === "combined") parseCombinedRows(records(), out);
  else if (kind === "legacy-gifts") parseLegacyGiftRows(records(), out);
  else if (kind === "legacy-payments") parseLegacyPaymentRows(records(), out);
  return out;
}

function parseLegacyGiftRows(records: Record<string, string>[], out: ParsedFile) {
  for (const o of records) {
    out.gifts.push({
      transactionDate: o["Transaction date"],
      transactionTimestamp: o["Transaction timestamp"],
      transferId: o["Transfer ID"],
      transferDate: o["Transfer date"],
      status: o["Status"],
      firstName: o["First name"],
      lastName: o["Last name"],
      email: o["Email"],
      grossAmount: num(o["Gross amount"]),
      fee: num(o["Fee"]),
      netAmount: num(o["Net amount"]),
      donorCoveredFee: (o["Donor covered fee"] ?? "").toLowerCase(),
      fund: o["Fund"],
      paymentMethod: o["Payment method"],
      memo: o["Memo"],
      giftId: o["Gift ID"],
    });
  }
}

function parseLegacyPaymentRows(records: Record<string, string>[], out: ParsedFile) {
  for (const o of records) {
    const transferId = o["Transfer ID"];
    out.payments.push({
      transactionDate: o["Transaction date"],
      transactionTimestamp: o["Transaction timestamp"],
      transferId,
      transferDate: o["Transfer date"],
      status: o["Status"],
      firstName: o["First name"],
      lastName: o["Last name"],
      email: o["Email"],
      grossAmount: num(o["Gross amount"]),
      fee: num(o["Fee"]),
      netAmount: num(o["Net amount"]),
      fund: o["Fund"],
      paymentSource: o["Payment source"],
      paymentMethod: o["Payment method"],
      paymentId: o["Payment ID"],
    });
    const amt = num(o["Transfer amount"]);
    if (transferId && amt && !out.transferAmounts.has(transferId)) out.transferAmounts.set(transferId, amt);
  }
}

function parseCombinedRows(records: Record<string, string>[], out: ParsedFile) {
  const { gifts, payments } = out;
  for (const o of records) {
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

// Reads every Subsplash export CSV in subsplash/transfers/ (combined or legacy
// format) and groups rows by Transfer ID. Unrecognized CSVs are skipped.
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
  const statedTransferAmounts = new Map<string, number>();

  for (const f of entries.filter((f) => /\.csv$/i.test(f))) {
    const p = path.join(TRANSFERS_DIR, f);
    const { gifts, payments, transferAmounts } = parseSubsplashCsv(readFileSync(p, "utf8"));
    if (gifts.length === 0 && payments.length === 0) continue;
    csvPaths.push(p);
    allGifts.push(...gifts);
    allPayments.push(...payments);
    for (const [id, amt] of transferAmounts) if (!statedTransferAmounts.has(id)) statedTransferAmounts.set(id, amt);
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
    // Legacy payments files state the bank deposit total; use it when present so
    // the card's "split matches deposit" check is meaningful. The combined
    // export has no such column, so fall back to the sum of row net amounts.
    t.transferAmount =
      statedTransferAmounts.get(t.id) ?? Math.round((t.giftsTotalNet + t.paymentsTotalNet) * 100) / 100;

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
