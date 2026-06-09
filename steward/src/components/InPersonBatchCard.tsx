"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { InPersonBatch } from "@/lib/in-person-csv";

export function InPersonBatchCard({
  batch,
  manuallyPosted,
  onMarkChange,
  onDelete,
  defaultExpanded = false,
  giftFundToPurpose = {},
}: {
  batch: InPersonBatch;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  defaultExpanded?: boolean;
  giftFundToPurpose?: Record<string, string | null>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [savingMark, setSavingMark] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const externalKey = `in-person:${batch.id}`;

  // Merge rollup lines that resolve to the same Aplos purpose. Multiple raw
  // CSV Fund values (e.g. "Tithe" and "General") may both map to the same
  // purpose ("General") — those collapse into one row, with the source CSV
  // fund names listed under the purpose name as "Tithe, General".
  type MergedGiftLine =
    | { matched: true; purpose: string; sourceFunds: string[]; count: number; gross: number }
    | { matched: false; fund: string; count: number; gross: number };
  const merged: MergedGiftLine[] = [];
  const byPurpose = new Map<string, Extract<MergedGiftLine, { matched: true }>>();
  for (const g of batch.giftRollup) {
    const purpose = giftFundToPurpose[g.fund];
    if (!purpose) {
      merged.push({ matched: false, fund: g.fund, count: g.count, gross: g.gross });
    } else {
      const existing = byPurpose.get(purpose);
      if (existing) {
        existing.count += g.count;
        existing.gross += g.gross;
        if (!existing.sourceFunds.includes(g.fund)) existing.sourceFunds.push(g.fund);
      } else {
        const line: Extract<MergedGiftLine, { matched: true }> = {
          matched: true,
          purpose,
          sourceFunds: [g.fund],
          count: g.count,
          gross: g.gross,
        };
        byPurpose.set(purpose, line);
        merged.push(line);
      }
    }
  }
  merged.sort((a, b) => b.gross - a.gross);

  const toggleManuallyPosted = async () => {
    const next = !manuallyPosted;
    onMarkChange(next);
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "in-person", marked: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      onMarkChange(!next);
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingMark(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete batch ${batch.batchName}? It will disappear from this view.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "in-person", deleted: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
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
            <span className="font-ui text-[13px] text-ink font-semibold">Batch {batch.batchName}</span>
            {batch.transactionDate && (
              <span className="font-ui text-[11.5px] text-ink3">recorded {fmtShortDate(batch.transactionDate)}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] text-forest font-medium tracking-tight">
            {fmtUSD(batch.totalGross, { sign: true })}
          </div>
          <div className="font-ui text-[10.5px] text-ink3 mt-0.5">
            {batch.giftCount} gift{batch.giftCount === 1 ? "" : "s"} · no fees
          </div>
        </div>
        <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer select-none" title="Mark as already posted to Aplos">
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
            title="Delete this batch from the view (dev affordance)"
            className="px-2.5 py-2 rounded-full border border-clay/30 text-clay font-ui text-[12px] cursor-pointer disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-bg">
          <div className="px-[18px] py-4">
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2 flex items-center justify-between">
                <div>
                  <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Gifts → Contribution batch</div>
                  <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                    {batch.giftCount} gift{batch.giftCount === 1 ? "" : "s"} · {fmtUSD(batch.totalGross, { sign: true })} gross
                  </div>
                </div>
                <span className="font-ui text-[10px] text-ink3">posts to /contributions</span>
              </div>
              <div>
                <div className="px-3.5 py-1.5 grid grid-cols-[1fr_2rem_5rem] gap-x-3 bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                  <div>Fund (purpose)</div>
                  <div className="text-right">Ct</div>
                  <div className="text-right">Gross</div>
                </div>
                {merged.map((g, i) => (
                  <div key={i} className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem] gap-x-3 border-b border-line2 items-center">
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
                    <div className="font-mono text-[12px] text-forest font-semibold text-right">{fmtUSD(g.gross, { sign: true })}</div>
                  </div>
                ))}
                <div className="px-3.5 py-2 grid grid-cols-[1fr_2rem_5rem] gap-x-3 bg-line2 items-center">
                  <div className="font-ui text-[11.5px] text-ink2 font-semibold">Total</div>
                  <div className="font-mono text-[11px] text-ink2 text-right font-semibold">{batch.giftCount}</div>
                  <div className="font-mono text-[11.5px] text-forest font-semibold text-right">{fmtUSD(batch.totalGross, { sign: true })}</div>
                </div>
              </div>

              <details className="px-3.5 py-2 border-t border-line2">
                <summary className="cursor-pointer font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">
                  Show all {batch.giftCount} donor lines
                </summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  {batch.gifts.map((g) => (
                    <div key={`${g.giftId}|${g.grossAmount}|${g.fund}`} className="py-1.5 grid grid-cols-[1fr_auto] gap-2 items-center text-[11px] font-ui">
                      <div className="min-w-0">
                        <div className="text-ink whitespace-nowrap overflow-hidden text-ellipsis">
                          {[g.firstName, g.lastName].filter(Boolean).join(" ") || g.email || "(unknown)"} <span className="text-ink3">· {g.fund}</span>
                        </div>
                        <div className="text-ink3 text-[10px]">
                          {g.transactionDate} · {g.paymentMethod}{g.checkNumber ? ` #${g.checkNumber}` : ""}
                          {g.memo ? ` · ${g.memo}` : ""}
                        </div>
                      </div>
                      <div className="font-mono text-forest font-semibold text-[11px]">{fmtUSD(g.grossAmount, { sign: true })}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
