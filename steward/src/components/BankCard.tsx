"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { SearchableSelect } from "./SearchableSelect";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";

export type BankEntryForCard = {
  externalKey: string;
  statementMonth: string;
  kind: "check" | "debit" | "credit";
  date: string;
  amount: number;
  description: string;
  checkNumber: number | null;
  accountNumber: number | null;
  fundId: number | null;
  tagId: number | null;
};

export type AccountOpt = { number: number; name: string; category: string | null };
export type FundOpt = { id: number; name: string };
export type TagOpt = { id: number; name: string; category: string | null };

export function BankCard({
  entry,
  accounts,
  funds,
  tags,
  accountsByNumber,
  fundsById,
  tagsById,
  manuallyEntered,
  onMarkChange,
  onCategorize,
}: {
  entry: BankEntryForCard;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  accountsByNumber: Record<number, string>;
  fundsById: Record<number, string>;
  tagsById: Record<number, string>;
  manuallyEntered: boolean;
  onMarkChange: (next: boolean) => void;
  onCategorize: (patch: { accountNumber?: number | null; fundId?: number | null; tagId?: number | null }) => void;
}) {
  const [savingMark, setSavingMark] = useState(false);

  const categorized = entry.accountNumber != null && entry.fundId != null && entry.tagId != null;

  const toggleEntered = async () => {
    const next = !manuallyEntered;
    onMarkChange(next);
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: entry.externalKey, source: "bank", marked: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      onMarkChange(!next);
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingMark(false);
    }
  };

  const saveField = async (patch: { accountNumber?: number | null; fundId?: number | null; tagId?: number | null }) => {
    onCategorize(patch);
    try {
      const res = await fetch("/api/bank/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: entry.externalKey, ...patch }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      alert(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const amountClass = entry.amount >= 0 ? "text-forest" : "text-clay";

  // Compact / grayed render for entries the user has marked as Entered in Aplos.
  if (manuallyEntered) {
    return (
      <div className="bg-line2/40 border border-line rounded-xl px-[18px] py-2 grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center opacity-60">
        <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">
          {entry.kind}{entry.checkNumber != null ? ` #${entry.checkNumber}` : ""}
        </div>
        <div className="min-w-0 font-ui text-[12px] text-ink2 truncate">
          {fmtShortDate(entry.date)} · {entry.description || "(no description)"}
        </div>
        <div className={`font-mono text-[13px] tabular-nums ${amountClass}`}>
          {fmtUSD(entry.amount, { sign: true })}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Unmark as entered">
          <input
            type="checkbox"
            checked
            onChange={toggleEntered}
            disabled={savingMark}
            className="w-4 h-4 accent-forest"
          />
          <span className="font-ui text-[11.5px] text-forest font-semibold">Entered</span>
        </label>
      </div>
    );
  }

  const cardClass = !categorized ? "border-honey/60 bg-honey-soft/20" : "border-line";

  return (
    <div className={`bg-panel border rounded-2xl px-[18px] py-3.5 grid grid-cols-[auto_1fr_auto_auto] gap-3.5 items-center ${cardClass}`}>
      <div className="text-center">
        <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">{entry.kind}</div>
        {entry.checkNumber != null && (
          <div className="font-mono text-[13px] text-ink mt-0.5">#{entry.checkNumber}</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SourceChip src="truist" />
          <span className="font-ui text-[13px] text-ink font-semibold truncate">
            {entry.description || "(no description)"}
          </span>
          {!categorized && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-honey/20 border border-honey/40 font-ui text-[10.5px] font-semibold text-honey">
              needs categorization
            </span>
          )}
        </div>
        <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
          {fmtShortDate(entry.date)}
          {categorized && (
            <> · {accountsByNumber[entry.accountNumber!] ?? `Account ${entry.accountNumber}`} · {fundsById[entry.fundId!] ?? `Fund ${entry.fundId}`} · {tagsById[entry.tagId!] ?? `Tag ${entry.tagId}`}</>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
            <SearchableSelect
              value={entry.accountNumber ?? 0}
              onChange={(v) => saveField({ accountNumber: v || null })}
              options={accounts.map((a) => ({
                value: a.number,
                label: `${a.name}${a.category ? ` (${a.category})` : ""}`,
                subLabel: String(a.number),
              }))}
              placeholder="— account —"
            />
            <SearchableSelect
              value={entry.fundId ?? 0}
              onChange={(v) => saveField({ fundId: v || null })}
              options={funds.map((f) => ({ value: f.id, label: f.name, subLabel: String(f.id) }))}
              placeholder="— fund —"
            />
            <SearchableSelect
              value={entry.tagId ?? 0}
              onChange={(v) => saveField({ tagId: v || null })}
              options={tags.map((t) => ({
                value: t.id,
                label: t.name,
                subLabel: String(t.id),
              }))}
              placeholder="— ministry —"
            />
        </div>
      </div>
      <div className="text-right">
        <div className={`font-display text-[20px] font-medium tracking-tight ${amountClass}`}>
          {fmtUSD(entry.amount, { sign: true })}
        </div>
      </div>
      <label
        className="flex items-center gap-2 select-none cursor-pointer"
        title="Mark as already entered in Aplos"
      >
        <input
          type="checkbox"
          checked={manuallyEntered}
          onChange={toggleEntered}
          disabled={savingMark}
          className="w-4 h-4 accent-forest"
        />
        <span className="font-ui text-[11.5px] text-ink2">Entered</span>
      </label>
    </div>
  );
}
