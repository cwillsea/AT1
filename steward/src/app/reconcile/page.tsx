import {
  tellerGet,
  type TellerAccount,
  type TellerBalances,
  type TellerTransaction,
} from "@/lib/teller";
import { getAccessToken } from "@/lib/aplos-auth";
import {
  fetchUnreconciledAplosForAccount,
  type AplosTxn,
} from "@/lib/aplos-transactions";
import { reconcile } from "@/lib/reconcile";
import { prisma } from "@/lib/db";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import { MonthFilter } from "@/components/MonthFilter";
import { ManualLinkButton, UnlinkButton } from "@/components/ManualLinkButton";

export const dynamic = "force-dynamic";

const TELLER_ACCOUNT_ID = "acc_ptamlmdg3u6it8ejig000";
const APLOS_CHECKING = 1110;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseMonth(raw: string | undefined) {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() };
  if (!raw) return fallback;
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return fallback;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return fallback;
  return { year, month: monthIdx };
}

function daysOld(iso: string): number {
  const ms = Date.now() - Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.max(0, Math.floor(ms / 86400000));
}

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonth(monthParam);
  const selectedValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  let account: TellerAccount | null = null;
  let balances: TellerBalances | null = null;
  let bankTxns: TellerTransaction[] = [];
  let aplosTxns: AplosTxn[] = [];
  let error: string | null = null;

  try {
    const [acctRes, balRes, txnRes, aplosToken] = await Promise.all([
      tellerGet<TellerAccount>(`/accounts/${TELLER_ACCOUNT_ID}`),
      tellerGet<TellerBalances>(`/accounts/${TELLER_ACCOUNT_ID}/balances`),
      tellerGet<TellerTransaction[]>(
        `/accounts/${TELLER_ACCOUNT_ID}/transactions?start_date=${startDate}&end_date=${endDate}`
      ),
      getAccessToken(),
    ]);
    if (acctRes.status !== 200) throw new Error(`account: HTTP ${acctRes.status}`);
    if (balRes.status !== 200)  throw new Error(`balances: HTTP ${balRes.status}`);
    if (txnRes.status !== 200)  throw new Error(`transactions: HTTP ${txnRes.status}`);
    account = acctRes.body;
    balances = balRes.body;
    bankTxns = txnRes.body ?? [];
    aplosTxns = await fetchUnreconciledAplosForAccount(aplosToken, APLOS_CHECKING);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const bankIds = bankTxns.map((t) => t.id);
  const aplosIds = aplosTxns.map((a) => a.id);
  const manualLinks = bankIds.length || aplosIds.length
    ? await prisma.reconcileMatch.findMany({
        where: {
          OR: [
            bankIds.length  ? { bankTxnId:  { in: bankIds  } } : undefined,
            aplosIds.length ? { aplosTxnId: { in: aplosIds } } : undefined,
          ].filter(Boolean) as { bankTxnId?: { in: string[] }; aplosTxnId?: { in: string[] } }[],
        },
      })
    : [];

  const { matched, bankOnly, booksOnly } = reconcile(bankTxns, aplosTxns, manualLinks);
  const ledger = balances ? Number(balances.ledger) : null;

  // Most recent uploaded bank statement — used as the last-known reconciled
  // anchor at the top of the page.
  const lastStatement = await prisma.bankStatement.findFirst({
    orderBy: { uploadedAt: "desc" },
  });

  const bankCandidates = bankOnly.map((b) => ({
    id: b.id,
    date: b.date,
    amount: Number(b.amount),
    description: b.description,
    badge: b.type,
  }));
  const aplosCandidates = booksOnly.map((a) => ({
    id: a.id,
    date: a.date,
    amount: a.cashAmount,
    description: a.note ?? a.memo ?? a.contact ?? `Aplos txn ${a.id}`,
    badge: a.checkNumberFromMemo ? `chk ${a.checkNumberFromMemo}` : undefined,
  }));

  // Sort: newest first
  const sortedBooks = [...booksOnly].sort((a, b) => (a.date < b.date ? 1 : -1));
  const sortedBank  = [...bankOnly].sort((a, b)  => (a.date < b.date ? 1 : -1));

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Reconcile
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            {account?.name ?? "Operating Checking"} · Aplos 1110
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            {account ? <>{account.institution.name} · ••{account.last_four}</> : "—"}
          </div>
        </div>
      </div>

      <div className="px-8 py-5">
        {error && (
          <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 mb-4">
            Fetch failed: <code className="font-mono text-[11.5px]">{error}</code>
          </div>
        )}

        {/* Anchor row — most recent uploaded statement + live bank ledger */}
        <div className="flex items-center gap-6 border border-line rounded-2xl px-5 py-3 mb-5">
          <div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">Bank ledger · live</div>
            <div className="font-display text-[20px] text-ink mt-0.5 font-medium tabular-nums">
              {ledger != null ? fmtUSD(ledger) : "—"}
            </div>
          </div>
          <div className="w-px h-10 bg-line" />
          <div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">Last reconciled statement</div>
            {lastStatement ? (
              <>
                <div className="font-ui text-[13px] text-ink mt-0.5">
                  {lastStatement.statementMonth} · ending <span className="tabular-nums font-mono">{fmtUSD(lastStatement.endingBalance)}</span>
                </div>
                <div className="font-ui text-[11px] text-ink3 mt-0.5">
                  Uploaded {lastStatement.uploadedAt.toLocaleDateString()} · <a className="underline" href="/bank">go to /bank</a>
                </div>
              </>
            ) : (
              <div className="font-ui text-[13px] text-ink3 mt-0.5">No statement uploaded yet · <a className="underline" href="/bank">upload one on /bank</a></div>
            )}
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-2 gap-4">
          {/* LEFT: unreconciled books */}
          <div className="border border-line rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-line bg-line2/40 flex items-center justify-between">
              <div>
                <div className="font-ui text-[12.5px] text-ink font-semibold">
                  Unreconciled in Aplos <span className="text-ink3 font-normal">· {sortedBooks.length}</span>
                </div>
                <div className="font-ui text-[11px] text-ink3 mt-0.5">All-time open entries on 1110</div>
              </div>
            </div>
            {sortedBooks.length === 0 ? (
              <div className="px-5 py-10 text-center font-ui text-[12.5px] text-ink3">
                Nothing open. All Aplos entries are reconciled.
              </div>
            ) : (
              <table className="w-full font-ui text-[12.5px] table-fixed">
                <colgroup>
                  <col className="w-[60px]" />
                  <col />
                  <col className="w-[88px]" />
                  <col className="w-[40px]" />
                </colgroup>
                <tbody>
                  {sortedBooks.map((a) => {
                    const stale = daysOld(a.date) > 30;
                    const title = a.note ?? a.memo ?? a.contact ?? `Aplos txn ${a.id}`;
                    return (
                      <tr key={a.id} className={`border-t border-line ${stale ? "bg-honey-soft/30" : ""}`}>
                        <td className="px-2 py-2 text-ink3 font-mono text-[10.5px] whitespace-nowrap align-top">{fmtShortDate(a.date)}</td>
                        <td className="px-1 py-2 text-ink break-words align-top">
                          {title}
                          {a.checkNumberFromMemo && (
                            <span className="ml-1.5 font-mono text-[10px] text-ink3">chk {a.checkNumberFromMemo}</span>
                          )}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums font-mono whitespace-nowrap align-top ${a.cashAmount >= 0 ? "text-forest" : "text-ink"}`}>
                          {fmtUSD(a.cashAmount, { sign: true })}
                        </td>
                        <td className="px-1 py-2 text-right align-top">
                          <ManualLinkButton side="books" selfId={a.id} selfAmount={a.cashAmount} candidates={bankCandidates} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* RIGHT: bank txns for the month */}
          <div className="border border-line rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-line bg-line2/40 flex items-center justify-between">
              <div>
                <div className="font-ui text-[12.5px] text-ink font-semibold">
                  Bank · {monthLabel} <span className="text-ink3 font-normal">· {sortedBank.length}</span>
                </div>
                <div className="font-ui text-[11px] text-ink3 mt-0.5">Unmatched bank transactions in window</div>
              </div>
              <MonthFilter selected={selectedValue} />
            </div>
            {sortedBank.length === 0 ? (
              <div className="px-5 py-10 text-center font-ui text-[12.5px] text-ink3">
                Every bank txn this month has a books match.
              </div>
            ) : (
              <table className="w-full font-ui text-[12.5px] table-fixed">
                <colgroup>
                  <col className="w-[60px]" />
                  <col />
                  <col className="w-[88px]" />
                  <col className="w-[40px]" />
                </colgroup>
                <tbody>
                  {sortedBank.map((b) => {
                    const amt = Number(b.amount);
                    return (
                      <tr key={b.id} className="border-t border-line">
                        <td className="px-2 py-2 text-ink3 font-mono text-[10.5px] whitespace-nowrap align-top">{fmtShortDate(b.date)}</td>
                        <td className="px-1 py-2 text-ink break-words align-top">
                          {b.description}
                          <span className={`ml-1.5 font-mono text-[10px] ${b.status === "posted" ? "text-ink3" : "text-honey"}`}>
                            {b.status === "pending" ? "pending" : b.type}
                          </span>
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums font-mono whitespace-nowrap align-top ${amt >= 0 ? "text-forest" : "text-ink"}`}>
                          {fmtUSD(amt, { sign: true })}
                        </td>
                        <td className="px-1 py-2 text-right align-top">
                          <ManualLinkButton side="bank" selfId={b.id} selfAmount={amt} candidates={aplosCandidates} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Matched section — collapsed by default */}
        <details className="mt-5 border border-line rounded-2xl overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer flex items-center justify-between bg-forest-soft/40">
            <div className="font-ui text-[12.5px] text-ink font-semibold">
              ✓ Matched <span className="text-ink3 font-normal">· {matched.length}</span>
            </div>
            <div className="font-ui text-[11px] text-ink3">Click to expand</div>
          </summary>
          {matched.length === 0 ? (
            <div className="px-5 py-6 text-center font-ui text-[12.5px] text-ink3">
              No matches yet.
            </div>
          ) : (
            <table className="w-full font-ui text-[12.5px]">
              <thead className="bg-line2/40 text-ink3 text-[10.5px] tracking-[0.06em] uppercase">
                <tr>
                  <th className="text-left px-4 py-2 w-[80px]">Bank</th>
                  <th className="text-left px-4 py-2">Bank description</th>
                  <th className="text-left px-4 py-2 w-[80px]">Books</th>
                  <th className="text-left px-4 py-2">Aplos note</th>
                  <th className="text-left px-4 py-2 w-[110px]">Via</th>
                  <th className="text-right px-4 py-2 w-[110px]">Amount</th>
                  <th className="text-right px-4 py-2 w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {matched.map((m) => {
                  const amt = Number(m.bank.amount);
                  return (
                    <tr key={`${m.bank.id}|${m.aplos.id}`} className="border-t border-line">
                      <td className="px-4 py-2 text-ink3 font-mono text-[11px]">{fmtShortDate(m.bank.date)}</td>
                      <td className="px-4 py-2 text-ink">{m.bank.description}</td>
                      <td className="px-4 py-2 text-ink3 font-mono text-[11px]">{fmtShortDate(m.aplos.date)}</td>
                      <td className="px-4 py-2 text-ink2">{m.aplos.note ?? m.aplos.memo ?? m.aplos.contact ?? ""}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[10px] tracking-[0.04em] uppercase px-1.5 py-0.5 rounded bg-line2 text-ink3">
                          {m.via}{m.dayDelta > 0 ? ` · ${m.dayDelta}d` : ""}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-mono ${amt >= 0 ? "text-forest" : "text-ink"}`}>
                        {fmtUSD(amt, { sign: true })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.via === "manual" && <UnlinkButton bankTxnId={m.bank.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </details>
      </div>
    </>
  );
}

