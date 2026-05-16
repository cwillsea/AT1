"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { FlowDiagram } from "./FlowDiagram";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { ClassifiedRow, RollupLine } from "@/lib/square-csv";

export type DepositForCard = {
  id: string;
  date: string;
  payoutAmount: number;
  itemCount: number;
  totalGross: number;
  totalFees: number;
  rows: ClassifiedRow[];
  rollup: RollupLine[];
};

// Resolved Aplos names passed in from the server page (one DB round-trip per page).
export type NameTable = {
  accounts: Record<number, string>;
  funds: Record<number, string>;
  tags: Record<number, string>;
};

const FEE_ACCOUNT = 5361;
const FEE_TAG = 339561; // "General"
const FEE_FUND = 521243; // "General Fund"
const CASH_ACCOUNT = 1110;

function nameOr(table: Record<number, string>, id: number, prefix: string) {
  return table[id] ?? `${prefix} ${id}`;
}

export function PayoutCard({
  deposit,
  names,
  defaultExpanded = false,
  manuallyPosted,
  onMarkChange,
  onDelete,
}: {
  deposit: DepositForCard;
  names: NameTable;
  defaultExpanded?: boolean;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [savingMark, setSavingMark] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const feeForDisplay = -deposit.totalFees;

  const handleDelete = async () => {
    if (!confirm(`Delete deposit ${deposit.id}? It will disappear from this view (you can restore it via the database if needed).`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: deposit.id, source: "square", deleted: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const toggleManuallyPosted = async () => {
    const next = !manuallyPosted;
    onMarkChange(next); // optimistic, parent updates
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: deposit.id, source: "square", marked: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      onMarkChange(!next); // rollback
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingMark(false);
    }
  };

  return (
    <div className={`bg-panel border rounded-2xl overflow-hidden transition-colors ${manuallyPosted ? "border-forest/40 bg-forest-soft/30" : "border-line"}`}>
      {/* Header row */}
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
          <div className="flex items-center gap-2">
            <SourceChip src="square" />
            <span className="font-ui text-[13px] text-ink font-semibold">Square deposit</span>
            <span className="font-ui text-[11.5px] text-ink3">· {deposit.itemCount} items</span>
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            {fmtShortDate(deposit.date)} · rolls up to {deposit.rollup.length} income line{deposit.rollup.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] text-forest font-medium tracking-tight">
            {fmtUSD(deposit.payoutAmount, { sign: true })}
          </div>
          <div className="font-ui text-[10.5px] text-ink3 mt-0.5">net of {fmtUSD(feeForDisplay)} fees</div>
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
            {expanded ? "Hide detail" : "Show source detail"}
          </button>
          <button
            disabled
            title="API posting not wired yet — use Manually posted for now"
            className="px-3.5 py-2 rounded-full bg-ink3/30 text-ink3 font-ui text-[12px] font-semibold cursor-not-allowed"
          >
            Post split → Aplos
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete this deposit from the view (dev affordance)"
            className="px-2.5 py-2 rounded-full border border-clay/30 text-clay font-ui text-[12px] cursor-pointer disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-bg">
          <div className="px-[18px] py-4">
            <FlowDiagram
              totalGross={deposit.totalGross}
              totalFees={deposit.totalFees}
              itemCount={deposit.itemCount}
              splitLineCount={deposit.rollup.length}
              payoutAmount={deposit.payoutAmount}
            />
          </div>

          <div className="px-[18px] pb-4 grid grid-cols-[1fr_1.2fr] gap-4">
            {/* Itemized source detail */}
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2">
                <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Source detail</div>
                <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                  Square · {deposit.itemCount} items
                </div>
              </div>
              <div className="max-h-80 overflow-auto">
                {deposit.rows.map((r, i) => (
                  <div key={i} className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1fr_auto] gap-2.5 items-start">
                    <div className="min-w-0">
                      <div className="font-ui text-[12px] text-ink whitespace-nowrap overflow-hidden text-ellipsis">
                        {r.description || "(no description)"}
                      </div>
                      <div className="font-ui text-[10.5px] text-ink3 mt-0.5">
                        → {nameOr(names.accounts, r.accountNumber, "Account")} · {nameOr(names.tags, r.tagId, "Tag")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[11.5px] text-forest font-semibold">
                        {fmtUSD(r.totalCollected, { sign: true })}
                      </div>
                      <div className="font-mono text-[9.5px] text-ink3 mt-0.5">
                        fee {fmtUSD(r.fees)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Split preview */}
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-line2">
                <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Split entry preview · posts to Aplos</div>
                <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                  {deposit.rollup.length} income line{deposit.rollup.length === 1 ? "" : "s"}
                  {deposit.totalFees > 0 ? " + 1 fee line" : ""} + cash to {nameOr(names.accounts, CASH_ACCOUNT, "Account")}
                </div>
              </div>
              <div>
                {/* Column header */}
                <div className="px-3.5 py-1.5 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-center bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                  <div>Account</div>
                  <div>Fund</div>
                  <div>Ministry</div>
                  <div className="text-right">Amount</div>
                </div>
                {deposit.rollup.map((r) => (
                  <div
                    key={`${r.accountNumber}-${r.fundId}-${r.tagId}`}
                    className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start"
                  >
                    <div>
                      <div className="font-ui text-[12px] text-ink font-medium leading-tight">{nameOr(names.accounts, r.accountNumber, "Account")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.accountNumber}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.funds, r.fundId, "Fund")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.fundId}</div>
                    </div>
                    <div>
                      <div className="font-ui text-[11.5px] text-ink leading-tight">{nameOr(names.tags, r.tagId, "Tag")}</div>
                      <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.tagId}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[12px] text-forest font-semibold">{fmtUSD(r.amount, { sign: true })}</div>
                      <div className="font-ui text-[10px] text-ink3 mt-0.5">{r.count} item{r.count > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                ))}
                {deposit.totalFees > 0 && (
                  <div className="px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start">
                    <div>
                      <div className="font-ui text-[12px] text-ink font-medium leading-tight">{nameOr(names.accounts, FEE_ACCOUNT, "Account")}</div>
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
                    <div className="font-mono text-[12px] text-clay font-semibold text-right">{fmtUSD(feeForDisplay)}</div>
                  </div>
                )}
                <div className="px-3.5 py-3 grid grid-cols-[1fr_auto] gap-2.5 items-center bg-forest-soft border-t border-line">
                  <div>
                    <div className="font-ui text-[12px] text-forest font-semibold">Cash → {nameOr(names.accounts, CASH_ACCOUNT, "Account")}</div>
                    <div className="font-mono text-[10px] text-forest/70 mt-0.5">{CASH_ACCOUNT}</div>
                  </div>
                  <div className="font-mono text-[13px] text-forest font-bold">{fmtUSD(deposit.payoutAmount, { sign: true })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
