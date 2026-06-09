"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { Transfer } from "@/lib/subsplash-csv";

type PaymentTarget = { accountNumber: number; fundId: number; tagId: number };
type Names = { accounts: Record<number, string>; funds: Record<number, string>; tags: Record<number, string> };

const CASH_ACCOUNT = 1110;
const FEE_ACCOUNT = 5361;
const FEE_FUND = 521243; // General Fund
const FEE_TAG = 339561;  // General

function nameOr(table: Record<number, string>, id: number, prefix: string) {
  return table[id] ?? `${prefix} ${id}`;
}

export function SubsplashCard({
  transfer,
  manuallyPosted,
  onMarkChange,
  onDelete,
  defaultExpanded = false,
  giftFundToPurpose = {},
  paymentSourceToTarget = {},
  names = { accounts: {}, funds: {}, tags: {} },
}: {
  transfer: Transfer;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  defaultExpanded?: boolean;
  giftFundToPurpose?: Record<string, string | null>;
  paymentSourceToTarget?: Record<string, PaymentTarget>;
  names?: Names;
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

  // Merge gift rollup lines that resolve to the same Aplos purpose. Multiple
  // raw CSV Fund values (e.g. "Tithe" + "General") can share a purpose — they
  // collapse to one line, with source funds listed under the purpose.
  type MergedGiftLine =
    | { matched: false; fund: string; count: number; gross: number; fee: number; net: number }
    | { matched: true; purpose: string; sourceFunds: string[]; count: number; gross: number; fee: number; net: number };
  const mergedGiftRollup: MergedGiftLine[] = [];
  const giftByPurpose = new Map<string, Extract<MergedGiftLine, { matched: true }>>();
  for (const g of transfer.giftRollup) {
    const purpose = giftFundToPurpose[g.fund];
    if (!purpose) {
      mergedGiftRollup.push({ matched: false, fund: g.fund, count: g.count, gross: g.gross, fee: g.fee, net: g.net });
    } else {
      const existing = giftByPurpose.get(purpose);
      if (existing) {
        existing.count += g.count;
        existing.gross += g.gross;
        existing.fee += g.fee;
        existing.net += g.net;
        if (!existing.sourceFunds.includes(g.fund)) existing.sourceFunds.push(g.fund);
      } else {
        const line: Extract<MergedGiftLine, { matched: true }> = {
          matched: true, purpose, sourceFunds: [g.fund], count: g.count, gross: g.gross, fee: g.fee, net: g.net,
        };
        giftByPurpose.set(purpose, line);
        mergedGiftRollup.push(line);
      }
    }
  }
  mergedGiftRollup.sort((a, b) => b.gross - a.gross);

  // Merge payment rollup lines that resolve to the same Aplos target.
  type MergedPaymentLine =
    | { matched: false; paymentSource: string; count: number; gross: number }
    | { matched: true; accountNumber: number; fundId: number; tagId: number; count: number; gross: number };

  const mergedPaymentRollup: MergedPaymentLine[] = [];
  const mergedByKey = new Map<string, Extract<MergedPaymentLine, { matched: true }>>();
  for (const p of transfer.paymentRollup) {
    const target = paymentSourceToTarget[p.paymentSource];
    if (!target) {
      mergedPaymentRollup.push({ matched: false, paymentSource: p.paymentSource, count: p.count, gross: p.gross });
    } else {
      const key = `${target.accountNumber}-${target.fundId}-${target.tagId}`;
      const existing = mergedByKey.get(key);
      if (existing) {
        existing.count += p.count;
        existing.gross += p.gross;
      } else {
        const line: Extract<MergedPaymentLine, { matched: true }> = { matched: true, ...target, count: p.count, gross: p.gross };
        mergedByKey.set(key, line);
        mergedPaymentRollup.push(line);
      }
    }
  }

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
      <div onClick={() => setExpanded((v) => !v)} className="px-[18px] py-3.5 grid grid-cols-[auto_1fr_auto_auto_auto] gap-3.5 items-center cursor-pointer">
        <button
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
            <span className="font-ui text-[13px] text-ink font-semibold">{fmtShortDate(transfer.transferDate)}</span>
            <span className="font-ui text-[13px] text-ink font-semibold">Transfer</span>
            <span className="font-mono text-[11.5px] text-ink3">#{transfer.id}</span>
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
        <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer select-none" title="Mark as already posted to Aplos manually">
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
        <div onClick={(e) => e.stopPropagation()} className="flex gap-2">
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
                {mergedGiftRollup.map((g, i) => (
                  <div key={i} className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem_4rem_5rem] gap-x-3 border-b border-line2 items-center">
                    <div>
                      <div className="font-ui text-[12px] text-ink">{g.matched ? g.purpose : g.fund}</div>
                      {g.matched && (
                        <div className="font-ui text-[10px] text-ink3">{g.sourceFunds.join(", ")}</div>
                      )}
                      {!g.matched && (
                        <div className="font-ui text-[10px] text-honey font-semibold">No rule</div>
                      )}
                    </div>
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

            {/* Payments section — split entry preview */}
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2">
                <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Split entry preview · posts to Aplos</div>
                <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                  {mergedPaymentRollup.length} payment line{mergedPaymentRollup.length === 1 ? "" : "s"}
                  {transfer.paymentsTotalFees > 0 ? " + 1 fee line" : ""} + cash to {nameOr(names.accounts, CASH_ACCOUNT, "Account")}
                </div>
              </div>
              <div>
                <div className="px-3.5 py-1.5 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                  <div>Account</div>
                  <div>Fund</div>
                  <div>Ministry</div>
                  <div className="text-right">Amount</div>
                </div>
                {mergedPaymentRollup.length === 0 && (
                  <div className="px-3.5 py-3 font-ui text-[11.5px] text-ink3 italic">No payment rows in this transfer</div>
                )}
                {mergedPaymentRollup.map((p, i) => p.matched ? (
                  <div key={i} className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start">
                    <div>
                      <div className="font-ui text-[12px] font-medium leading-tight text-ink">{nameOr(names.accounts, p.accountNumber, "Account")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{p.accountNumber}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.funds, p.fundId, "Fund")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{p.fundId}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.tags, p.tagId, "Tag")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{p.tagId}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-[12px] font-semibold ${p.gross < 0 ? "text-clay" : "text-forest"}`}>{fmtUSD(p.gross, { sign: true })}</div>
                      <div className="font-ui text-[10px] text-ink3 mt-0.5">{p.count} item{p.count > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start bg-honey-soft/40">
                    <div>
                      <div className="font-ui text-[12px] font-medium leading-tight text-honey">Unmatched — no rule</div>
                      <div className="font-ui text-[10px] text-ink3 mt-0.5">{p.paymentSource}</div>
                    </div>
                    <div className="font-ui text-[11.5px] text-ink3">—</div>
                    <div className="font-ui text-[11.5px] text-ink3">—</div>
                    <div className="text-right">
                      <div className="font-mono text-[12px] font-semibold text-honey">{fmtUSD(p.gross, { sign: true })}</div>
                      <div className="font-ui text-[10px] text-ink3 mt-0.5">{p.count} item{p.count > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                ))}
                {transfer.paymentsTotalFees > 0 && (
                  <div className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start">
                    <div>
                      <div className="font-ui text-[12px] text-ink font-medium leading-tight">Subsplash fees</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{FEE_ACCOUNT}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.funds, FEE_FUND, "Fund")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{FEE_FUND}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.tags, FEE_TAG, "Tag")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{FEE_TAG}</div>
                    </div>
                    <div className="font-mono text-[12px] text-clay font-semibold text-right">{fmtUSD(-transfer.paymentsTotalFees)}</div>
                  </div>
                )}
                <div className="px-3.5 py-3 grid grid-cols-[1fr_auto] gap-2.5 items-center bg-forest-soft border-t border-line">
                  <div>
                    <div className="font-ui text-[12px] text-forest font-semibold">Cash → {nameOr(names.accounts, CASH_ACCOUNT, "Account")}</div>
                    <div className="font-mono text-[10px] text-forest/70 mt-0.5">{CASH_ACCOUNT}</div>
                  </div>
                  <div className="font-mono text-[13px] text-forest font-bold">{fmtUSD(transfer.paymentsTotalNet, { sign: true })}</div>
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
