// Pure matching engine: pair Teller bank transactions with Aplos book
// transactions for the same account window. No I/O — caller passes in both
// lists plus any user-confirmed manual links from the DB.
import type { TellerTransaction } from "./teller";
import type { AplosTxn } from "./aplos-transactions";

export type ManualLink = { bankTxnId: string; aplosTxnId: string };

export type Match = {
  bank: TellerTransaction;
  aplos: AplosTxn;
  via: "manual" | "check-number" | "amount-date";
  dayDelta: number;
};

export type ReconcileResult = {
  matched: Match[];
  bankOnly: TellerTransaction[];
  booksOnly: AplosTxn[];
};

const DATE_WINDOW_DAYS = 7;

function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) -
             Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.abs(Math.round(ms / 86400000));
}

function bankCheckNumber(t: TellerTransaction): string | undefined {
  const m = (t.description || "").match(/(?:check\s*#?|ck\s*#?|#)\s*0*(\d{2,6})/i);
  if (m) return m[1];
  // Teller often returns just "CHECK 1234" or the bare number for check images
  if (t.type?.toLowerCase().includes("check")) {
    const bare = (t.description || "").match(/\b0*(\d{2,6})\b/);
    if (bare) return bare[1];
  }
  return undefined;
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export function reconcile(
  bankTxns: TellerTransaction[],
  aplosTxns: AplosTxn[],
  manualLinks: ManualLink[],
): ReconcileResult {
  const matched: Match[] = [];
  const usedBank = new Set<string>();
  const usedAplos = new Set<string>();

  const aplosById = new Map(aplosTxns.map((a) => [a.id, a]));
  const bankById  = new Map(bankTxns.map((b) => [b.id, b]));

  // 1) Manual links win.
  for (const link of manualLinks) {
    const b = bankById.get(link.bankTxnId);
    const a = aplosById.get(link.aplosTxnId);
    if (!b || !a) continue;
    if (usedBank.has(b.id) || usedAplos.has(a.id)) continue;
    matched.push({ bank: b, aplos: a, via: "manual", dayDelta: daysBetween(b.date, a.date) });
    usedBank.add(b.id);
    usedAplos.add(a.id);
  }

  // 2) Check-number matches. Teller signs amounts: a check is negative; Aplos
  //    line on 1110 is also negative for checks, so we compare directly.
  for (const b of bankTxns) {
    if (usedBank.has(b.id)) continue;
    const checkNo = bankCheckNumber(b);
    if (!checkNo) continue;
    const bAmt = Number(b.amount);
    const candidate = aplosTxns.find((a) =>
      !usedAplos.has(a.id) &&
      a.checkNumberFromMemo === checkNo &&
      amountsEqual(a.cashAmount, bAmt)
    );
    if (candidate) {
      matched.push({ bank: b, aplos: candidate, via: "check-number", dayDelta: daysBetween(b.date, candidate.date) });
      usedBank.add(b.id);
      usedAplos.add(candidate.id);
    }
  }

  // 3) Amount-exact + date within ±7 days. Prefer closest date.
  for (const b of bankTxns) {
    if (usedBank.has(b.id)) continue;
    const bAmt = Number(b.amount);
    let best: { a: AplosTxn; delta: number } | null = null;
    for (const a of aplosTxns) {
      if (usedAplos.has(a.id)) continue;
      if (!amountsEqual(a.cashAmount, bAmt)) continue;
      const delta = daysBetween(b.date, a.date);
      if (delta > DATE_WINDOW_DAYS) continue;
      if (!best || delta < best.delta) best = { a, delta };
    }
    if (best) {
      matched.push({ bank: b, aplos: best.a, via: "amount-date", dayDelta: best.delta });
      usedBank.add(b.id);
      usedAplos.add(best.a.id);
    }
  }

  const bankOnly  = bankTxns.filter((b) => !usedBank.has(b.id));
  const booksOnly = aplosTxns.filter((a) => !usedAplos.has(a.id));

  return { matched, bankOnly, booksOnly };
}

// Aggregate net change per side — drives the header diff number.
export function netChange(
  bankTxns: TellerTransaction[],
  aplosTxns: AplosTxn[],
): { bankNet: number; booksNet: number; difference: number } {
  const bankNet  = bankTxns.reduce((s, t) => s + Number(t.amount), 0);
  const booksNet = aplosTxns.reduce((s, t) => s + t.cashAmount, 0);
  return {
    bankNet:  Number(bankNet.toFixed(2)),
    booksNet: Number(booksNet.toFixed(2)),
    difference: Number((bankNet - booksNet).toFixed(2)),
  };
}
