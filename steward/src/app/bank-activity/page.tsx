import {
  tellerGet,
  type TellerAccount,
  type TellerBalances,
  type TellerTransaction,
} from "@/lib/teller";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// Hardcoded for now — Enterprise Bank & Trust (MO) CHURCH CHECKING.
// When we generalize, list /accounts and let the user pick.
const ACCOUNT_ID = "acc_ptamlmdg3u6it8ejig000";

export default async function BankActivityPage() {
  let account: TellerAccount | null = null;
  let balances: TellerBalances | null = null;
  let transactions: TellerTransaction[] = [];
  let error: string | null = null;

  try {
    const [acctRes, balRes, txnRes] = await Promise.all([
      tellerGet<TellerAccount>(`/accounts/${ACCOUNT_ID}`),
      tellerGet<TellerBalances>(`/accounts/${ACCOUNT_ID}/balances`),
      tellerGet<TellerTransaction[]>(`/accounts/${ACCOUNT_ID}/transactions`),
    ]);
    if (acctRes.status !== 200) throw new Error(`account: HTTP ${acctRes.status}`);
    if (balRes.status !== 200)  throw new Error(`balances: HTTP ${balRes.status}`);
    if (txnRes.status !== 200)  throw new Error(`transactions: HTTP ${txnRes.status}`);
    account = acctRes.body;
    balances = balRes.body;
    transactions = txnRes.body ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Sort newest → oldest. Teller usually returns this order but enforce it.
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const ledger = balances ? Number(balances.ledger) : null;
  const available = balances ? Number(balances.available) : null;

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Bank activity
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            {account?.name ?? "Loading…"}
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            {account ? (
              <>
                {account.institution.name} · {account.subtype} · ••{account.last_four}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">Ledger</div>
            <div className="font-display text-[22px] text-ink mt-0.5 font-medium tabular-nums">
              {ledger != null ? fmtUSD(ledger) : "—"}
            </div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">Available</div>
            <div className="font-display text-[22px] text-forest mt-0.5 font-medium tabular-nums">
              {available != null ? fmtUSD(available) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-5">
        {error && (
          <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 mb-4">
            Teller request failed: <code className="font-mono text-[11.5px]">{error}</code>
          </div>
        )}

        <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-2">
          Transactions · {sorted.length}
        </div>

        <div className="border border-line rounded-xl overflow-hidden">
          <table className="w-full font-ui text-[12.5px]">
            <thead className="bg-line2/40 text-ink3 text-[10.5px] tracking-[0.06em] uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 w-[90px]">Date</th>
                <th className="text-left px-4 py-2.5">Description</th>
                <th className="text-left px-4 py-2.5 w-[110px]">Type</th>
                <th className="text-left px-4 py-2.5 w-[90px]">Status</th>
                <th className="text-right px-4 py-2.5 w-[120px]">Amount</th>
                <th className="text-right px-4 py-2.5 w-[130px]">Running</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink3 font-ui text-[12px]">
                    No transactions returned.
                  </td>
                </tr>
              )}
              {sorted.map((t) => {
                const amt = Number(t.amount);
                const running = t.running_balance != null ? Number(t.running_balance) : null;
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2.5 text-ink2 font-mono text-[11.5px]">{fmtShortDate(t.date)}</td>
                    <td className="px-4 py-2.5 text-ink">{t.description}</td>
                    <td className="px-4 py-2.5 text-ink3 font-mono text-[11px]">{t.type}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-mono text-[10.5px] tracking-[0.04em] uppercase px-1.5 py-0.5 rounded ${
                          t.status === "posted" ? "bg-forest-soft text-forest" : "bg-honey-soft text-honey"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${amt >= 0 ? "text-forest" : "text-ink"}`}>
                      {fmtUSD(amt, { sign: true })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-ink3">
                      {running != null ? fmtUSD(running) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
