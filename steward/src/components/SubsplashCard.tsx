"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { Transfer } from "@/lib/subsplash-csv";

export function SubsplashCard({
  transfer,
  manuallyPosted,
  onMarkChange,
  onDelete,
  defaultExpanded = false,
}: {
  transfer: Transfer;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [savingMark, setSavingMark] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const externalKey = `subsplash:${transfer.id}`;

  const handleDelete = async () => {
    if (!confirm(`Delete transfer ${transfer.id}? It will disappear from this view.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "subsplash", deleted: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };
  const totalFees = transfer.giftsTotalFees + transfer.paymentsTotalFees;
  const totalNet = transfer.giftsTotalNet + transfer.paymentsTotalNet;
  const splitMatchesDeposit = Math.abs(totalNet - transfer.transferAmount) < 0.01;

  const toggleManuallyPosted = async () => {
    const next = !manuallyPosted;
    onMarkChange(next);
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "subsplash", marked: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      onMarkChange(!next);
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingMark(false);
    }
  };

  return (
    <div className={`bg-panel border rounded-2xl overflow-hidden transition-colors ${manuallyPosted ? "border-forest/40 bg-forest-soft/30" : "border-line"}`}>
      <div className="px-[18px] py-3.5 grid grid-cols-[auto_1fr_auto_auto_auto] gap-3.5 items-center">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`w-[26px] h-[26px] rounded-md grid place-items-center text-ink2 ${expanded ? "bg-forest-soft" : "bg-transparent"}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>
            <path d="M 3 2 L 8 6 L 3 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceChip src="subsplash" />
            <span className="font-ui text-[13px] text-ink font-semibold">Transfer</span>
            <span className="font-mono text-[11.5px] text-ink2">#{transfer.id}</span>
            <span className="font-ui text-[11.5px] text-ink3">·</span>
            <span className="font-ui text-[11.5px] text-ink3">{transfer.giftCount} gifts</span>
            <span className="font-ui text-[11.5px] text-ink3">·</span>
            <span className="font-ui text-[11.5px] text-ink3">{transfer.paymentCount} payments</span>
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            Deposited {fmtShortDate(transfer.transferDate)} · {transfer.giftRollup.length} gift fund{transfer.giftRollup.length === 1 ? "" : "s"} + {transfer.paymentRollup.length} payment source{transfer.paymentRollup.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] text-forest font-medium tracking-tight">
            {fmtUSD(transfer.transferAmount, { sign: true })}
          </div>
          <div className="font-ui text-[10.5px] text-ink3 mt-0.5">
            net of {fmtUSD(-totalFees)} fees
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none" title="Mark as already posted to Aplos manually">
          <input
            type="checkbox"
            checked={manuallyPosted}
            onChange={toggleManuallyPosted}
            disabled={savingMark}
            className="w-4 h-4 accent-forest cursor-pointer"
          />
          <span className={`font-ui text-[11.5px] ${manuallyPosted ? "text-forest font-semibold" : "text-ink2"}`}>
            Manually posted
          </span>
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-2 rounded-full border border-line font-ui text-[12px] text-ink2 cursor-pointer"
          >
            {expanded ? "Hide detail" : "Show detail"}
          </button>
          <button
            disabled
            title="API posting not wired yet — use Manually posted for now"
            className="px-3.5 py-2 rounded-full bg-ink3/30 text-ink3 font-ui text-[12px] font-semibold cursor-not-allowed"
          >
            Post → Aplos
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete this transfer from the view (dev affordance)"
            className="px-2.5 py-2 rounded-full border border-clay/30 text-clay font-ui text-[12px] cursor-pointer disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-bg">
          <div className="px-[18px] py-4 grid grid-cols-2 gap-4">
            {/* Gifts section */}
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2 flex items-center justify-between">
                <div>
                  <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Gifts → Contribution batch</div>
                  <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                    {transfer.giftCount} gift{transfer.giftCount === 1 ? "" : "s"} · {fmtUSD(transfer.giftsTotalNet, { sign: true })} net
                  </div>
                </div>
                <span className="font-ui text-[10px] text-ink3">posts to /contributions</span>
              </div>
              <div>
                <div className="px-3.5 py-1.5 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                  <div>Fund (purpose)</div>
                  <div className="text-right">Ct</div>
                  <div className="text-right">Gross</div>
                  <div className="text-right">Fee</div>
                  <div className="text-right">Net</div>
                </div>
                {transfer.giftRollup.map((g) => (
                  <div key={g.fund} className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 border-b border-line2 items-center">
                    <div className="font-ui text-[12px] text-ink">{g.fund}</div>
                    <div className="font-mono text-[11px] text-ink2 text-right">{g.count}</div>
                    <div className="font-mono text-[11px] text-ink2 text-right">{fmtUSD(g.gross)}</div>
                    <div className="font-mono text-[11px] text-clay text-right">{fmtUSD(-g.fee)}</div>
                    <div className="font-mono text-[12px] text-forest font-semibold text-right">{fmtUSD(g.net, { sign: true })}</div>
                  </div>
                ))}
                <div className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 bg-line2 items-center">
                  <div className="font-ui text-[11.5px] text-ink2 font-semibold">Total</div>
                  <div className="font-mono text-[11px] text-ink2 text-right font-semibold">{transfer.giftCount}</div>
                  <div className="font-mono text-[11px] text-ink2 text-right font-semibold">{fmtUSD(transfer.giftRollup.reduce((s, g) => s + g.gross, 0))}</div>
                  <div className="font-mono text-[11.5px] text-clay font-semibold text-right">{fmtUSD(-transfer.giftsTotalFees)}</div>
                  <div className="font-mono text-[11.5px] text-forest font-semibold text-right">{fmtUSD(transfer.giftsTotalNet, { sign: true })}</div>
                </div>
              </div>

              <details className="px-3.5 py-2 border-t border-line2">
                <summary className="cursor-pointer font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">
                  Show all {transfer.giftCount} donor lines
                </summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  {transfer.gifts.map((g) => (
                    <div key={`${g.giftId}|${g.grossAmount}`} className="py-1.5 grid grid-cols-[1fr_auto] gap-2 items-center text-[11px] font-ui">
                      <div className="min-w-0">
                        <div className="text-ink whitespace-nowrap overflow-hidden text-ellipsis">
                          {[g.firstName, g.lastName].filter(Boolean).join(" ") || g.email || "(unknown)"} <span className="text-ink3">· {g.fund}</span>
                        </div>
                        <div className="text-ink3 text-[10px]">{g.transactionDate} {g.transactionTimestamp}</div>
                      </div>
                      <div className="font-mono text-forest font-semibold text-[11px]">{fmtUSD(g.netAmount, { sign: true })}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Payments section */}
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2 flex items-center justify-between">
                <div>
                  <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Payments → Register transaction</div>
                  <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                    {transfer.paymentCount} payment{transfer.paymentCount === 1 ? "" : "s"} · {fmtUSD(transfer.paymentsTotalNet, { sign: true })} net
                  </div>
                </div>
                <span className="font-ui text-[10px] text-ink3">posts to /transactions</span>
              </div>
              <div>
                <div className="px-3.5 py-1.5 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                  <div>Payment source</div>
                  <div className="text-right">Ct</div>
                  <div className="text-right">Gross</div>
                  <div className="text-right">Fee</div>
                  <div className="text-right">Net</div>
                </div>
                {transfer.paymentRollup.map((p) => (
                  <div key={p.paymentSource} className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 border-b border-line2 items-center">
                    <div className="font-ui text-[12px] text-ink">{p.paymentSource}</div>
                    <div className="font-mono text-[11px] text-ink2 text-right">{p.count}</div>
                    <div className="font-mono text-[11px] text-ink2 text-right">{fmtUSD(p.gross)}</div>
                    <div className="font-mono text-[11px] text-clay text-right">{fmtUSD(-p.fee)}</div>
                    <div className={`font-mono text-[12px] font-semibold text-right ${p.net < 0 ? "text-clay" : "text-forest"}`}>{fmtUSD(p.net, { sign: true })}</div>
                  </div>
                ))}
                {transfer.paymentRollup.length === 0 && (
                  <div className="px-3.5 py-3 font-ui text-[11.5px] text-ink3 italic">No payment rows in this transfer</div>
                )}
                <div className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 bg-line2 items-center">
                  <div className="font-ui text-[11.5px] text-ink2 font-semibold">Total</div>
                  <div className="font-mono text-[11px] text-ink2 text-right font-semibold">{transfer.paymentCount}</div>
                  <div className="font-mono text-[11px] text-ink2 text-right font-semibold">{fmtUSD(transfer.paymentRollup.reduce((s, p) => s + p.gross, 0))}</div>
                  <div className="font-mono text-[11.5px] text-clay font-semibold text-right">{fmtUSD(-transfer.paymentsTotalFees)}</div>
                  <div className={`font-mono text-[11.5px] font-semibold text-right ${transfer.paymentsTotalNet < 0 ? "text-clay" : "text-forest"}`}>{fmtUSD(transfer.paymentsTotalNet, { sign: true })}</div>
                </div>
              </div>

              <details className="px-3.5 py-2 border-t border-line2">
                <summary className="cursor-pointer font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">
                  Show all {transfer.paymentCount} payment lines
                </summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  {transfer.payments.map((p) => (
                    <div key={p.paymentId} className="py-1.5 grid grid-cols-[1fr_auto] gap-2 items-center text-[11px] font-ui">
                      <div className="min-w-0">
                        <div className="text-ink whitespace-nowrap overflow-hidden text-ellipsis">
                          {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "(unknown)"} <span className="text-ink3">· {p.paymentSource}</span>
                        </div>
                        <div className="text-ink3 text-[10px]">{p.transactionDate} {p.transactionTimestamp}</div>
                      </div>
                      <div className="font-mono text-forest font-semibold text-[11px]">{fmtUSD(p.netAmount, { sign: true })}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* Footer: total reconciliation */}
          <div className="px-[18px] pb-4">
            <div className={`px-3.5 py-3 rounded-xl flex items-center justify-between ${splitMatchesDeposit ? "bg-forest-soft border border-forest/30" : "bg-clay-soft border border-clay/30"}`}>
              <div>
                <div className={`font-ui text-[12px] font-semibold ${splitMatchesDeposit ? "text-forest" : "text-clay"}`}>
                  {splitMatchesDeposit ? "Cash → Operating Checking · matches transfer" : "Mismatch — split total ≠ deposit amount"}
                </div>
                <div className="font-ui text-[10px] text-ink3 mt-0.5">
                  Gifts {fmtUSD(transfer.giftsTotalNet)} + Payments {fmtUSD(transfer.paymentsTotalNet)} = {fmtUSD(totalNet)} · transfer says {fmtUSD(transfer.transferAmount)}
                </div>
              </div>
              <div className="font-mono text-[13px] text-forest font-bold">{fmtUSD(transfer.transferAmount, { sign: true })}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
