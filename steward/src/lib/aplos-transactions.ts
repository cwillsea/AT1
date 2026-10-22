// Fetches Aplos GL transactions touching one account (e.g. 1110 Operating
// Checking) within a date window. The Aplos listing endpoint returns header
// data only — to get signed line amounts we follow each id to
// /transactions/{id}. Probed shapes are documented in
// steward/scripts/probe-aplos-reconcile*.ts.
import { aplos } from "./aplos-auth";

export type AplosTxn = {
  id: string;          // stringified Aplos transaction id (matches ReconcileMatch.aplosTxnId)
  date: string;        // YYYY-MM-DD
  note?: string;
  memo?: string;
  contact?: string;    // displayable counterparty
  // Signed net amount that hit the target account across all lines.
  // Positive = deposit/credit to checking, negative = check/withdrawal.
  cashAmount: number;
  checkNumberFromMemo?: string;
  isReconciled?: boolean;
};

type AplosTxnHeader = {
  id: number;
  date: string;
  note?: string;
  memo?: string;
  contact?: { companyname?: string; firstname?: string; lastname?: string };
  amount: number;
  is_reconciled?: boolean;
};

type AplosLine = {
  amount: number;
  account?: { account_number?: number };
};

type AplosTxnDetail = AplosTxnHeader & { lines?: AplosLine[] };

// Tries to find a check number in the note/memo of an Aplos txn. Aplos doesn't
// have a dedicated check_number field — treasurers usually paste "Check 1234"
// or "#1234" into the note.
function extractCheckNumber(...sources: (string | undefined)[]): string | undefined {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(/(?:check\s*#?|ck\s*#?|#)\s*0*(\d{2,6})/i);
    if (m) return m[1];
  }
  return undefined;
}

function contactName(c: AplosTxnHeader["contact"]): string | undefined {
  if (!c) return undefined;
  if (c.companyname) return c.companyname;
  const parts = [c.firstname, c.lastname].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

async function listIds(
  token: string,
  query: { accountNumber: number; startDate?: string; endDate?: string; reconciled?: "y" | "n" },
): Promise<AplosTxnHeader[]> {
  const params = new URLSearchParams();
  params.set("account_number", String(query.accountNumber));
  params.set("page_size", "100");
  if (query.startDate) params.set("start_date", query.startDate);
  if (query.endDate)   params.set("end_date",   query.endDate);
  if (query.reconciled) params.set("f_reconciled", query.reconciled);

  const headers: AplosTxnHeader[] = [];
  let page = 1;
  while (true) {
    params.set("page_num", String(page));
    const { status, body } = await aplos(token, `/transactions?${params.toString()}`);
    if (status !== 200) throw new Error(`Aplos /transactions failed: HTTP ${status}`);
    const batch: AplosTxnHeader[] = body?.data?.transactions ?? [];
    headers.push(...batch);
    if (batch.length < 100 || !body?.links?.next) break;
    page += 1;
    if (page > 500) break; // all-time history safety cap (50k txns)
  }
  return headers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch a single txn detail. On 429 (Aplos rate limit) back off and retry up
// to 5 times with exponential delay. Other non-200s return null.
async function fetchDetail(token: string, id: number): Promise<AplosTxnDetail | null> {
  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { status, body } = await aplos(token, `/transactions/${id}`);
    if (status === 200) return body?.data?.transaction ?? null;
    if (status === 429) {
      await sleep(delay);
      delay = Math.min(delay * 2, 16000);
      continue;
    }
    return null;
  }
  return null;
}

// Throttled batched detail fetcher: 3 concurrent + 150ms pause between batches.
// Conservative because Aplos hands out 429s when we run hotter.
export async function fetchDetailsInBatches(token: string, ids: number[], batchSize = 3): Promise<AplosTxnDetail[]> {
  const out: AplosTxnDetail[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const results = await Promise.all(slice.map((id) => fetchDetail(token, id)));
    for (const r of results) if (r) out.push(r);
    if (i + batchSize < ids.length) await sleep(150);
  }
  return out;
}

function toAplosTxn(d: AplosTxnDetail, accountNumber: number): AplosTxn {
  const cashAmount = (d.lines ?? [])
    .filter((l) => l.account?.account_number === accountNumber)
    .reduce((s, l) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
  return {
    id: String(d.id),
    date: d.date,
    note: d.note || undefined,
    memo: d.memo || undefined,
    contact: contactName(d.contact),
    cashAmount: Number(cashAmount.toFixed(2)),
    checkNumberFromMemo: extractCheckNumber(d.note, d.memo),
    isReconciled: d.is_reconciled,
  };
}

export async function fetchAplosTransactionsForAccount(
  token: string,
  accountNumber: number,
  startDate: string,
  endDate: string,
): Promise<AplosTxn[]> {
  const headers = await listIds(token, { accountNumber, startDate, endDate });
  const details = await fetchDetailsInBatches(token, headers.map((h) => h.id));
  return details.map((d) => toAplosTxn(d, accountNumber));
}

// Unreconciled GL txns touching the target account, no date filter — the
// outstanding-books side of /reconcile.
export async function fetchUnreconciledAplosForAccount(
  token: string,
  accountNumber: number,
): Promise<AplosTxn[]> {
  const headers = await listIds(token, { accountNumber, reconciled: "n" });
  const details = await fetchDetailsInBatches(token, headers.map((h) => h.id));
  return details.map((d) => toAplosTxn(d, accountNumber));
}

// Sums every line on the given account across all transactions Aplos returns.
// Aplos has no balance/report endpoints (confirmed via probe), so we walk the
// full GL history once. Slow on first run — cache the result.
export async function computeAplosAccountBalance(
  token: string,
  accountNumber: number,
): Promise<{ balance: number; txnCount: number }> {
  const headers = await listIds(token, { accountNumber });
  const details = await fetchDetailsInBatches(token, headers.map((h) => h.id), 3);
  let balance = 0;
  for (const d of details) {
    for (const l of d.lines ?? []) {
      if (l.account?.account_number === accountNumber && typeof l.amount === "number") {
        balance += l.amount;
      }
    }
  }
  return { balance: Number(balance.toFixed(2)), txnCount: details.length };
}

