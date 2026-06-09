"use client";

import { useMemo, useState } from "react";
import { PowerChurchCard, type AccountOpt, type FundOpt, type TagOpt, type Split } from "./PowerChurchCard";
import { fmtUSD } from "@/lib/fmt";
import type { PCEntry } from "@/lib/powerchurch-csv";

type Names = { accounts: Record<number, string>; funds: Record<number, string>; tags: Record<number, string> };

const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
function monthSortKey(label: string): number {
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return -Infinity;
  return Number(m[2]) * 12 + (MONTH_INDEX[m[1].toLowerCase()] ?? 0);
}

export function PowerChurchList({
  entries,
  initialMarkedKeys,
  initialDeletedKeys,
  initialSplits,
  accounts,
  funds,
  tags,
  names,
}: {
  entries: PCEntry[];
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  initialSplits: Record<string, Split[]>;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  names: Names;
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));
  const [splits, setSplits] = useState<Record<string, Split[]>>(initialSplits);

  const externalKey = (e: PCEntry) => `powerchurch:${e.id}`;

  const setMark = (key: string, next: boolean) => {
    setMarked((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };
  const markDeleted = (key: string) => setDeleted((prev) => new Set(prev).add(key));
  const setSplitsFor = (key: string, next: Split[]) => {
    setSplits((prev) => ({ ...prev, [key]: next }));
  };

  const visible = entries.filter((e) => !deleted.has(externalKey(e)));

  const groups = useMemo(() => {
    const m = new Map<string, PCEntry[]>();
    for (const e of visible) {
      const label = e.month || "Unknown month";
      const arr = m.get(label) ?? [];
      arr.push(e);
      m.set(label, arr);
    }
    return Array.from(m.entries())
      .sort((a, b) => monthSortKey(b[0]) - monthSortKey(a[0]))
      .map(([month, items]) => ({ month, items }));
  }, [visible]);

  if (groups.length === 0) {
    return (
      <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
        No entries uploaded yet. Drop a PowerChurch Journal Report CSV or PDF above.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, i) => (
        <MonthShelf
          key={g.month}
          month={g.month}
          items={g.items}
          marked={marked}
          setMark={setMark}
          markDeleted={markDeleted}
          splits={splits}
          setSplitsFor={setSplitsFor}
          accounts={accounts}
          funds={funds}
          tags={tags}
          names={names}
          defaultOpen={i === 0}
          externalKey={externalKey}
        />
      ))}
    </div>
  );
}

function MonthShelf({
  month,
  items,
  marked,
  setMark,
  markDeleted,
  splits,
  setSplitsFor,
  accounts,
  funds,
  tags,
  names,
  defaultOpen,
  externalKey,
}: {
  month: string;
  items: PCEntry[];
  marked: Set<string>;
  setMark: (key: string, next: boolean) => void;
  markDeleted: (key: string) => void;
  splits: Record<string, Split[]>;
  setSplitsFor: (key: string, next: Split[]) => void;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  names: Names;
  defaultOpen: boolean;
  externalKey: (e: PCEntry) => string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const sorted = [...items].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const pending = sorted.filter((e) => !marked.has(externalKey(e)));
  const pendingNet = pending.reduce((s, e) => s + (e.isVoid ? e.amount : -e.amount), 0);
  const totalNet = sorted.reduce((s, e) => s + (e.isVoid ? e.amount : -e.amount), 0);

  return (
    <div className="border border-line rounded-xl bg-panel/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-[18px] py-3.5 cursor-pointer hover:bg-line2/40 rounded-xl"
      >
        <div className="flex items-center gap-3">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}
            className="text-ink2"
          >
            <path d="M 3 2 L 8 6 L 3 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-[18px] text-ink font-medium tracking-tight">{month}</span>
          <span className="font-ui text-[11px] text-ink3">
            {items.length} entries · {pending.length} pending
          </span>
        </div>
        <div className="text-right">
          <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">pending net</div>
          <div className={`font-display text-[16px] font-medium ${pendingNet >= 0 ? "text-forest" : "text-clay"}`}>
            {fmtUSD(pendingNet, { sign: true })}
          </div>
          <div className="font-ui text-[10px] text-ink3 mt-0.5">
            (all: {fmtUSD(totalNet, { sign: true })})
          </div>
        </div>
      </button>

      {open && (
        <div className="px-[18px] pb-4 pt-1 flex flex-col gap-2.5">
          {sorted.map((e, i) => {
            const key = externalKey(e);
            return (
              <PowerChurchCard
                key={key}
                entry={e}
                defaultExpanded={i === 0 && !marked.has(key)}
                manuallyPosted={marked.has(key)}
                onMarkChange={(next) => setMark(key, next)}
                onDelete={() => markDeleted(key)}
                splits={splits[key] ?? []}
                onSplitsChange={(next) => setSplitsFor(key, next)}
                accounts={accounts}
                funds={funds}
                tags={tags}
                names={names}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
