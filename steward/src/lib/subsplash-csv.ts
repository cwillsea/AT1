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
  transferAmount: number; // total deposit
};

export type GiftRollup = { fund: string; count: number; gross: number; fee: number; net: number };
export type PaymentRollup = { paymentSource: string; count: number; gross: number; fee: number; net: number };

export type Transfer = {
  id: string;             // transferId
  transferDate: string;   // YYYY-MM-DD
  transferAmount: number; // total bank deposit
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
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return { header, rows: rows.filter((r) => r.length === header.length) };
}

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : 0;
};

function parseGiftCsv(text: string): GiftRow[] {
  const { header, rows } = parseCsv(text);
  return rows.map((r) => {
    const o = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>;
    return {
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
      donorCoveredFee: o["Donor covered fee"],
      fund: o["Fund"],
      paymentMethod: o["Payment method"],
      memo: o["Memo"],
      giftId: o["Gift ID"],
    };
  });
}

function parsePaymentCsv(text: string): PaymentRow[] {
  const { header, rows } = parseCsv(text);
  return rows.map((r) => {
    const o = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>;
    return {
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
      fund: o["Fund"],
      paymentSource: o["Payment source"],
      paymentMethod: o["Payment method"],
      paymentId: o["Payment ID"],
      transferAmount: num(o["Transfer amount"]),
    };
  });
}

const TRANSFERS_DIR = path.resolve(process.cwd(), "..", "subsplash", "transfers");

export function getTransfersDir(): string {
  return TRANSFERS_DIR;
}

// Reads every gifts-*.csv and payments-*.csv in subsplash/transfers/ and
// groups by transfer ID. Files of either type are optional per transfer.
export function loadAllTransfers(): { csvPaths: string[]; transfers: Transfer[] } {
  let entries: string[];
  try {
    entries = readdirSync(TRANSFERS_DIR);
  } catch {
    throw new Error(`No subsplash/transfers directory at ${TRANSFERS_DIR}`);
  }

  const giftFiles = entries.filter((f) => /^gifts.*\.csv$/i.test(f));
  const paymentFiles = entries.filter((f) => /^payments.*\.csv$/i.test(f));

  const allGifts: GiftRow[] = [];
  const allPayments: PaymentRow[] = [];
  const csvPaths: string[] = [];

  for (const f of giftFiles) {
    const p = path.join(TRANSFERS_DIR, f);
    csvPaths.push(p);
    allGifts.push(...parseGiftCsv(readFileSync(p, "utf8")));
  }
  for (const f of paymentFiles) {
    const p = path.join(TRANSFERS_DIR, f);
    csvPaths.push(p);
    allPayments.push(...parsePaymentCsv(readFileSync(p, "utf8")));
  }

  // Dedupe by Gift ID / Payment ID (in case of overlapping uploads)
  const seenGifts = new Set<string>();
  const dedupedGifts = allGifts.filter((g) => {
    const k = g.giftId || `${g.transferId}|${g.transactionTimestamp}|${g.email}|${g.grossAmount}`;
    if (seenGifts.has(k)) return false;
    seenGifts.add(k);
    return true;
  });
  const seenPayments = new Set<string>();
  const dedupedPayments = allPayments.filter((p) => {
    const k = p.paymentId || `${p.transferId}|${p.transactionTimestamp}|${p.email}|${p.grossAmount}`;
    if (seenPayments.has(k)) return false;
    seenPayments.add(k);
    return true;
  });

  // Group by transferId
  const byId = new Map<string, Transfer>();
  const ensure = (id: string, transferDate: string, transferAmount = 0): Transfer => {
    if (!byId.has(id)) {
      byId.set(id, {
        id, transferDate, transferAmount,
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
    const t = ensure(p.transferId, p.transferDate, p.transferAmount);
    t.payments.push(p);
    t.paymentCount += 1;
    t.paymentsTotalNet += p.netAmount;
    t.paymentsTotalFees += p.fee;
    // Payments csv carries the authoritative transfer amount
    if (p.transferAmount && !t.transferAmount) t.transferAmount = p.transferAmount;
  }

  // If no payments, transferAmount falls back to giftsTotalNet
  for (const t of byId.values()) {
    if (!t.transferAmount) t.transferAmount = t.giftsTotalNet + t.paymentsTotalNet;

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
