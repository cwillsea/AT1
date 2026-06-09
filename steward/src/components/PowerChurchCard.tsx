"use client";

import { useEffect, useState } from "react";
import { SearchableSelect } from "./SearchableSelect";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { PCEntry } from "@/lib/powerchurch-csv";

// Plain text input that holds a draft string so the user sees exactly what
// they typed (no <input type="number"> auto-coercion). Commits to the parent
// only when the draft parses cleanly. Empty/"-" intermediate states are kept
// without zeroing out, so backspacing through a number doesn't fight you.
function AmountInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string>(value.toString());
  // When the parent's amount changes (add/remove split, persisted reload), sync.
  useEffect(() => { setDraft(value.toString()); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const trimmed = v.trim();
        if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return;
        const n = parseFloat(trimmed);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={(e) => {
        const n = parseFloat(e.target.value);
        if (!Number.isFinite(n)) { onCommit(0); setDraft("0"); }
        else { setDraft(n.toString()); }
      }}
      className="px-2 py-1.5 rounded border border-line bg-white font-mono text-[12px] text-right focus:outline-none focus:border-forest"
    />
  );
}

export type AccountOpt = { number: number; name: string; category: string | null };
export type FundOpt = { id: number; name: string };
export type TagOpt = { id: number; name: string; category: string | null };

export type Split = {
  amount: number;
  accountNumber: number | null;
  fundId: number | null;
  tagId: number | null;
};
type Names = { accounts: Record<number, string>; funds: Record<number, string>; tags: Record<number, string> };

export function PowerChurchCard({
  entry,
  manuallyPosted,
  onMarkChange,
  onDelete,
  splits,
  onSplitsChange,
  accounts,
  funds,
  tags,
  names,
  defaultExpanded = false,
}: {
  entry: PCEntry;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  splits: Split[];
  onSplitsChange: (next: Split[]) => void;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  names: Names;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [savingMark, setSavingMark] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const externalKey = `powerchurch:${entry.id}`;

  // If we have no splits yet, present a single default row sized to the entry total.
  const effective: Split[] = splits.length > 0
    ? splits
    : [{ amount: entry.amount, accountNumber: null, fundId: null, tagId: null }];

  const splitsTotal = effective.reduce((s, r) => s + r.amount, 0);
  const balancesEntry = Math.abs(splitsTotal - entry.amount) < 0.01;
  const allLinesCategorized = effective.every((r) => r.accountNumber != null && r.fundId != null && r.tagId != null);
  // Ready to export = every split has account+fund+ministry. The sum vs entry
  // total is shown as a hint but not gated, so payroll-style entries with
  // signed splits can still export without being forced to match the gross.
  const ready = allLinesCategorized;

  const persist = async (next: Split[]) => {
    onSplitsChange(next);
    try {
      const res = await fetch("/api/powerchurch/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, splits: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      alert(`Failed to save splits: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const updateSplit = (i: number, patch: Partial<Split>) => {
    const next = effective.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    persist(next);
  };
  const addSplit = () => {
    const remaining = +(entry.amount - splitsTotal).toFixed(2);
    const next: Split[] = [...effective, { amount: Math.max(remaining, 0), accountNumber: null, fundId: null, tagId: null }];
    persist(next);
  };
  const removeSplit = (i: number) => {
    if (effective.length <= 1) return;
    const next = effective.filter((_, idx) => idx !== i);
    persist(next);
  };

  const toggle = async () => {
    const next = !manuallyPosted;
    onMarkChange(next);
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "powerchurch", marked: next }),
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
    if (!confirm(`Delete ${entry.reference} ${entry.payee}? It will disappear from this view.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey, source: "powerchurch", deleted: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDelete();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const balanced = Math.abs(entry.totalDebit - entry.totalCredit) < 0.01;
  const journalLabel = entry.journal === "AP" ? "Accounts Payable" : entry.journal === "PR" ? "Payroll" : entry.journal;
  const refBadgeClass = entry.isVoid
    ? "bg-clay-soft text-clay border-clay/40"
    : entry.journal === "PR"
      ? "bg-honey-soft text-honey border-honey/40"
      : "bg-forest-soft text-forest border-forest/40";

  if (manuallyPosted) {
    return (
      <div className="bg-line2/40 border border-line rounded-xl px-[18px] py-2 grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center opacity-60">
        <div className={`px-2 py-0.5 rounded-full border font-ui text-[10.5px] font-semibold ${refBadgeClass}`}>
          {entry.reference}
        </div>
        <div className="min-w-0 font-ui text-[12px] text-ink2 truncate">
          {fmtShortDate(entry.date)} · {entry.payee || "(no payee)"} · {journalLabel}
        </div>
        <div className="font-mono text-[13px] tabular-nums text-clay">
          {fmtUSD(-entry.amount, { sign: true })}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Unmark as entered">
          <input
            type="checkbox"
            checked
            onChange={toggle}
            disabled={savingMark}
            className="w-4 h-4 accent-forest"
          />
          <span className="font-ui text-[11.5px] text-forest font-semibold">Entered</span>
        </label>
      </div>
    );
  }

  const primaryExpenseLine = entry.lines.find((l) => l.debit > 0 && /^\d{2}-[56]/.test(l.accountCode))
    ?? entry.lines.find((l) => l.debit > 0)
    ?? entry.lines[0];

  return (
    <div className={`bg-panel border rounded-2xl overflow-hidden ${entry.isVoid ? "border-clay/30" : !ready ? "border-honey/60 bg-honey-soft/15" : "border-line"}`}>
      <div className="px-[18px] py-3.5 grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-3.5 items-center">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`w-[26px] h-[26px] rounded-md grid place-items-center text-ink2 cursor-pointer ${expanded ? "bg-forest-soft" : "bg-transparent"}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>
            <path d="M 3 2 L 8 6 L 3 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`px-2.5 py-1 rounded-full border font-ui text-[11px] font-semibold ${refBadgeClass}`}>
          {entry.reference}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-ui text-[13px] text-ink font-semibold">{entry.payee || "(no payee)"}</span>
            <span className="font-ui text-[11.5px] text-ink3">{fmtShortDate(entry.date)}</span>
            <span className="font-ui text-[10.5px] text-ink3 px-1.5 py-0.5 rounded-full bg-line2 border border-line">
              {journalLabel}
            </span>
            {entry.isVoid && (
              <span className="font-ui text-[10.5px] text-clay font-semibold px-1.5 py-0.5 rounded-full bg-clay-soft border border-clay/40">
                VOID
              </span>
            )}
            {!allLinesCategorized && !entry.isVoid && (
              <span className="font-ui text-[10.5px] font-semibold text-honey px-1.5 py-0.5 rounded-full bg-honey/20 border border-honey/40">
                needs categorization
              </span>
            )}
            {!balanced && (
              <span className="font-ui text-[10.5px] text-honey font-semibold">
                Unbalanced — {fmtUSD(entry.totalDebit)} dr / {fmtUSD(entry.totalCredit)} cr
              </span>
            )}
          </div>
          <div className="font-ui text-[11px] text-ink3 mt-0.5">
            {entry.lines.length} split line{entry.lines.length === 1 ? "" : "s"}
            {primaryExpenseLine && (
              <> · <span className="font-mono">{primaryExpenseLine.accountCode}</span> {primaryExpenseLine.accountName}</>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-display text-[20px] font-medium tracking-tight ${entry.isVoid ? "text-honey" : "text-clay"}`}>
            {fmtUSD(entry.isVoid ? entry.amount : -entry.amount, { sign: true })}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none" title="Mark as already entered in Aplos">
          <input
            type="checkbox"
            checked={manuallyPosted}
            onChange={toggle}
            disabled={savingMark}
            className="w-4 h-4 accent-forest"
          />
          <span className="font-ui text-[11.5px] text-ink2">Entered</span>
        </label>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Hide this entry from the view"
          className="px-2.5 py-2 rounded-full border border-clay/30 text-clay font-ui text-[12px] cursor-pointer disabled:opacity-50"
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>

      {/* Aplos split lines */}
      <div className="px-[18px] pb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">
            Aplos split lines · {effective.length}
          </div>
          <div className={`font-ui text-[10.5px] ${balancesEntry ? "text-ink3" : "text-clay font-semibold"}`}>
            Σ {fmtUSD(splitsTotal)} / {fmtUSD(entry.amount)}
          </div>
        </div>
        {effective.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_6rem_auto] gap-2 items-center">
            <SearchableSelect
              value={line.accountNumber ?? 0}
              onChange={(v) => updateSplit(i, { accountNumber: v || null })}
              options={accounts.map((a) => ({
                value: a.number,
                label: `${a.name}${a.category ? ` (${a.category})` : ""}`,
                subLabel: String(a.number),
              }))}
              placeholder="— account —"
            />
            <SearchableSelect
              value={line.fundId ?? 0}
              onChange={(v) => updateSplit(i, { fundId: v || null })}
              options={funds.map((f) => ({ value: f.id, label: f.name, subLabel: String(f.id) }))}
              placeholder="— fund —"
            />
            <SearchableSelect
              value={line.tagId ?? 0}
              onChange={(v) => updateSplit(i, { tagId: v || null })}
              options={tags.map((t) => ({ value: t.id, label: t.name, subLabel: String(t.id) }))}
              placeholder="— ministry —"
            />
            <AmountInput value={line.amount} onCommit={(n) => updateSplit(i, { amount: n })} />
            <button
              onClick={() => removeSplit(i)}
              disabled={effective.length <= 1}
              title={effective.length <= 1 ? "Need at least one line" : "Remove this split"}
              className="w-7 h-7 grid place-items-center rounded-md border border-line text-ink3 cursor-pointer hover:text-clay hover:border-clay/40 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addSplit}
          className="self-start px-2.5 py-1 rounded-full border border-line text-ink2 font-ui text-[11.5px] cursor-pointer hover:bg-line2"
        >
          + Add split
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line bg-bg">
          <div className="px-[18px] py-4">
            <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase mb-2">
              Original PowerChurch split
            </div>
            <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
              <div className="px-3.5 py-1.5 grid grid-cols-[6rem_1fr_1.4fr_5rem_5rem] gap-x-3 bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
                <div>Account</div>
                <div>Name</div>
                <div>Memo</div>
                <div className="text-right">Debit</div>
                <div className="text-right">Credit</div>
              </div>
              {entry.lines.map((l, i) => (
                <div key={i} className="px-3.5 py-2 grid grid-cols-[6rem_1fr_1.4fr_5rem_5rem] gap-x-3 border-b border-line2 items-center">
                  <div className="font-mono text-[11.5px] text-ink2">{l.accountCode}</div>
                  <div className="font-ui text-[12px] text-ink">{l.accountName}</div>
                  <div className="font-ui text-[11.5px] text-ink3">{l.memo || "—"}</div>
                  <div className={`font-mono text-[12px] text-right ${l.debit > 0 ? "text-ink font-semibold" : "text-ink3"}`}>
                    {l.debit > 0 ? fmtUSD(l.debit) : ""}
                  </div>
                  <div className={`font-mono text-[12px] text-right ${l.credit > 0 ? "text-ink font-semibold" : "text-ink3"}`}>
                    {l.credit > 0 ? fmtUSD(l.credit) : ""}
                  </div>
                </div>
              ))}
              <div className="px-3.5 py-2 grid grid-cols-[6rem_1fr_1.4fr_5rem_5rem] gap-x-3 bg-line2 items-center">
                <div className="font-ui text-[11px] text-ink2 font-semibold col-span-3">Totals</div>
                <div className="font-mono text-[12px] text-right font-semibold">{fmtUSD(entry.totalDebit)}</div>
                <div className="font-mono text-[12px] text-right font-semibold">{fmtUSD(entry.totalCredit)}</div>
              </div>
            </div>

            {(entry.from || entry.posted) && (
              <div className="mt-3 font-ui text-[10.5px] text-ink3 leading-snug">
                {entry.from && <div>{entry.from}</div>}
                {entry.posted && <div>{entry.posted}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
