// Syncs a local, normalized copy of the Aplos general ledger into
// AplosTransaction / AplosTransactionLine / AplosLineTag. This is the queryable
// copy of "the books" — Aplos exposes no balance/report endpoints, so this
// normalized ledger is our reporting/query layer.
//
// Endpoint facts confirmed by scripts/probe-aplos-ledger-shape.ts:
//   • GET /transactions LIST returns headers only
//     (id, date, contact, created, modified, amount, in_closed_period) —
//     note/memo and lines come ONLY from GET /transactions/{id}.
//   • Line-level tags are omitted from the detail response UNLESS you pass
//     ?allTags=y (case-sensitive capital T). With it, each line carries
//     tags: [{ id, name }]. Without it, tags never appear.
//   • f_rangestart/f_rangeend preserve the filter into links.next (safe paging);
//     the legacy start_date/end_date do NOT.
//   • f_lastupdated wants exactly yyyy-MM-ddTHH:mm:ss.SSS-0700 (RFC822 offset,
//     ms required) — i.e. the exact format Aplos returns `modified` in, so the
//     watermark round-trips verbatim.
import { getAccessToken, aplos } from "./aplos-auth";
import { prisma } from "./db";

const SOURCE = "aplos-ledger";
const PAGE_SIZE = 200;
const DETAIL_BATCH = 3;      // Aplos hands out 429s above ~3 concurrent detail fetches
const DETAIL_PAUSE_MS = 150;

type AplosContact = { id?: number; companyname?: string; firstname?: string; lastname?: string };
type AplosDetailLine = {
  id?: number;
  amount?: number;
  account?: { account_number?: number };
  fund?: { id?: number };
  tags?: Array<{ id?: number } | number>;
};
type AplosDetail = {
  id: number;
  date: string;
  note?: string;
  memo?: string;
  contact?: AplosContact;
  amount?: number;
  is_reconciled?: boolean;
  in_closed_period?: boolean;
  created?: string;
  modified?: string;
  lines?: AplosDetailLine[];
};

function contactName(c?: AplosContact): string | null {
  if (!c) return null;
  if (c.companyname) return c.companyname;
  const parts = [c.firstname, c.lastname].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Walk the paginated LIST endpoint, following links.next (which carries the
// filter forward for f_* params). Returns header objects — ids only are needed.
async function listTransactionHeaders(token: string, firstPath: string): Promise<{ id: number }[]> {
  const headers: { id: number }[] = [];
  let next: string | null = firstPath;
  let guard = 0;
  while (next) {
    const { status, body } = await aplos(token, next);
    if (status !== 200) throw new Error(`Aplos LIST /transactions failed: HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
    const batch: { id: number }[] = body?.data?.transactions ?? [];
    headers.push(...batch);
    const link: string | undefined = body?.links?.next;
    next = link ? link.replace(/^\/api\/v1/, "") : null;
    if (++guard > 2000) break; // safety cap (~400k txns at page_size 200)
  }
  return headers;
}

// One detail fetch with 429 backoff. Returns the raw transaction object so we
// keep every field (fund, tags, line ids, note/memo) — not the narrowed shape
// used by aplos-transactions.ts.
async function fetchDetail(token: string, id: number): Promise<AplosDetail | null> {
  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    // allTags=y is required for the detail response to include line-level tags.
    const { status, body } = await aplos(token, `/transactions/${id}?allTags=y`);
    if (status === 200) return (body?.data?.transaction as AplosDetail) ?? null;
    if (status === 429) {
      await sleep(delay);
      delay = Math.min(delay * 2, 16000);
      continue;
    }
    return null;
  }
  return null;
}

// Throttled batched detail fetcher (3 concurrent + 150ms pause), mirroring the
// proven throttle in aplos-transactions.ts.
async function fetchDetailsInBatches(token: string, ids: number[]): Promise<AplosDetail[]> {
  const out: AplosDetail[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const slice = ids.slice(i, i + DETAIL_BATCH);
    const results = await Promise.all(slice.map((id) => fetchDetail(token, id)));
    for (const r of results) if (r) out.push(r);
    if (i + DETAIL_BATCH < ids.length) await sleep(DETAIL_PAUSE_MS);
  }
  return out;
}

// Upsert one transaction header, then fully replace its lines + line-tags so an
// edited transaction's splits stay correct. Wrapped in a single DB transaction.
async function upsertTransaction(d: AplosDetail): Promise<void> {
  const header = {
    date: d.date,
    note: d.note ?? null,
    memo: d.memo ?? null,
    contactName: contactName(d.contact),
    contactId: d.contact?.id ?? null,
    amount: typeof d.amount === "number" ? d.amount : 0,
    isReconciled: Boolean(d.is_reconciled),
    inClosedPeriod: Boolean(d.in_closed_period),
    createdAt: d.created ?? null,
    modifiedAt: d.modified ?? null,
    raw: JSON.stringify(d),
    syncedAt: new Date(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.aplosTransaction.upsert({
      where: { id: d.id },
      create: { id: d.id, ...header },
      update: header,
    });

    // Replace lines (cascade deletes AplosLineTag) then re-create from payload.
    await tx.aplosTransactionLine.deleteMany({ where: { transactionId: d.id } });
    const lines = d.lines ?? [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (typeof l.id !== "number") continue; // no line id → can't key it; skip defensively
      const tagIds = (l.tags ?? [])
        .map((t) => (typeof t === "number" ? t : t?.id))
        .filter((x): x is number => typeof x === "number");
      await tx.aplosTransactionLine.create({
        data: {
          id: l.id,
          transactionId: d.id,
          lineIndex: i,
          amount: typeof l.amount === "number" ? l.amount : 0,
          accountNumber: l.account?.account_number ?? null,
          fundId: l.fund?.id ?? null,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
      });
    }
  });
}

export type LedgerSyncResult = {
  mode: "full" | "incremental";
  headersListed: number;
  detailsFetched: number;
  watermark: string | null; // max `modified` seen, stored for next run
};

export async function syncAplosLedger(): Promise<LedgerSyncResult> {
  const token = await getAccessToken();

  const state = await prisma.syncState.findUnique({ where: { source: SOURCE } });
  const watermark = state?.lastFetchedThrough ?? null;

  // Incremental keys on `modified` via f_lastupdated (catches edits + backdated
  // entries). First run has no watermark → walk all-time by date range (epoch →
  // today) using f_rangestart/f_rangeend, which page safely via links.next.
  const mode: "full" | "incremental" = watermark ? "incremental" : "full";
  const firstPath =
    mode === "incremental"
      ? `/transactions?f_lastupdated=${encodeURIComponent(watermark!)}&page_size=${PAGE_SIZE}`
      : `/transactions?f_rangestart=1900-01-01&f_rangeend=${todayLocal()}&page_size=${PAGE_SIZE}`;

  try {
    const headers = await listTransactionHeaders(token, firstPath);
    const ids = headers.map((h) => h.id).filter((id): id is number => typeof id === "number");
    const details = await fetchDetailsInBatches(token, ids);

    let maxModified = watermark;
    let maxModifiedMs = watermark ? Date.parse(watermark) : -Infinity;
    for (const d of details) {
      await upsertTransaction(d);
      if (d.modified) {
        const ms = Date.parse(d.modified);
        if (Number.isFinite(ms) && ms > maxModifiedMs) {
          maxModifiedMs = ms;
          maxModified = d.modified;
        }
      }
    }

    await prisma.syncState.upsert({
      where: { source: SOURCE },
      create: { source: SOURCE, lastFetchedThrough: maxModified, lastSyncAt: new Date() },
      update: { lastFetchedThrough: maxModified, lastSyncAt: new Date(), lastError: null },
    });

    return { mode, headersListed: ids.length, detailsFetched: details.length, watermark: maxModified };
  } catch (e) {
    await prisma.syncState.upsert({
      where: { source: SOURCE },
      create: { source: SOURCE, lastError: e instanceof Error ? e.message : String(e) },
      update: { lastError: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
