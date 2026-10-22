"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BankCard, type BankEntryForCard, type AccountOpt, type FundOpt, type TagOpt } from "./BankCard";
import { fmtUSD } from "@/lib/fmt";

type StatementSummary = {
  beginningBalance: number;
  totalAdditions: number;
  totalSubtractions: number;
  endingBalance: number;
};

type Props = {
  entries: BankEntryForCard[];
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  names: {
    accounts: Record<number, string>;
    funds: Record<number, string>;
    tags: Record<number, string>;
  };
  summariesByMonth: Record<string, StatementSummary>;
};

const KINDS = ["check", "debit", "credit"] as const;
type Kind = (typeof KINDS)[number];

// Sort "May 2026" labels newest-first by parsing the month name + year.
const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
function monthSortKey(label: string): number {
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return -Infinity;
  const month = MONTH_INDEX[m[1].toLowerCase()] ?? 0;
  return Number(m[2]) * 12 + month;
}

export function BankEntryList({ entries, initialMarkedKeys, initialDeletedKeys, accounts, funds, tags, names, summariesByMonth }: Props) {
  const router = useRouter();
  const [marked, setMarked] = useState(() => new Set(initialMarkedKeys));
  // Soft-deleted entries (legacy data) stay hidden — no UI to create new ones now.
  const [deleted] = useState(() => new Set(initialDeletedKeys));
  // Whole statements the user is currently deleting — hidden optimistically.
  const [deletingMonths, setDeletingMonths] = useState<Set<string>>(() => new Set());

  const deleteStatement = async (month: string) => {
    if (!confirm(`Delete the entire "${month}" statement and all its entries? This can't be undone (re-upload the PDF to restore).`)) return;
    setDeletingMonths((prev) => new Set(prev).add(month));
    try {
      const res = await fetch("/api/bank/delete-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statementMonth: month }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      // Roll back the optimistic hide on failure.
      setDeletingMonths((prev) => {
        const n = new Set(prev);
        n.delete(month);
        return n;
      });
      alert(`Failed to delete statement: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const [categorization, setCategorization] = useState<Record<string, { accountNumber: number | null; fundId: number | null; tagId: number | null }>>(() => {
    const init: Record<string, { accountNumber: number | null; fundId: number | null; tagId: number | null }> = {};
    for (const e of entries) init[e.externalKey] = { accountNumber: e.accountNumber, fundId: e.fundId, tagId: e.tagId };
    return init;
  });

  const visible = entries
    .filter((e) => !deleted.has(e.externalKey) && !deletingMonths.has(e.statementMonth))
    .map((e) => ({ ...e, ...categorization[e.externalKey] }));

  // Group by statementMonth, then sort groups newest-first.
  const groups = useMemo(() => {
    const m = new Map<string, BankEntryForCard[]>();
    for (const e of visible) {
      const arr = m.get(e.statementMonth) ?? [];
      arr.push(e);
      m.set(e.statementMonth, arr);
    }
    return Array.from(m.entries())
      .sort((a, b) => monthSortKey(b[0]) - monthSortKey(a[0]))
      .map(([month, items]) => ({ month, items }));
  }, [visible]);

  // A month is "completed" once its pending net (sum of unentered amounts)
  // rounds to zero — everything on the statement is accounted for. Recomputed
  // from `marked` so a month slides into the Completed section the moment the
  // last entry is marked.
  const { active, completed } = useMemo(() => {
    const active: typeof groups = [];
    const completed: typeof groups = [];
    for (const g of groups) {
      const pendingNet = g.items
        .filter((e) => !marked.has(e.externalKey))
        .reduce((s, e) => s + e.amount, 0);
      if (Math.abs(pendingNet) < 0.005) completed.push(g);
      else active.push(g);
    }
    return { active, completed };
  }, [groups, marked]);

  if (groups.length === 0) {
    return (
      <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
        No statements uploaded yet. Drop a PDF above to get started.
      </div>
    );
  }

  const renderShelf = (g: (typeof groups)[number], defaultOpen: boolean) => (
    <StatementShelf
      key={g.month}
      month={g.month}
      items={g.items}
      summary={summariesByMonth[g.month] ?? null}
      marked={marked}
      setMarked={setMarked}
      setCategorization={setCategorization}
      accounts={accounts}
      funds={funds}
      tags={tags}
      names={names}
      defaultOpen={defaultOpen}
      onDelete={() => deleteStatement(g.month)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 && (
        <div className="bg-forest-soft border border-forest/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
          All statements are fully accounted for — nothing pending.
        </div>
      )}
      {active.map((g, i) => renderShelf(g, i === 0))}

      {completed.length > 0 && (
        <div className="mt-1 border-t border-line pt-4 flex flex-col gap-3">
          <div className="px-[18px] font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase">
            Completed · {completed.length} statement{completed.length === 1 ? "" : "s"}
          </div>
          {completed.map((g) => renderShelf(g, false))}
        </div>
      )}
    </div>
  );
}

function StatementShelf({
  month,
  items,
  summary,
  marked,
  setMarked,
  setCategorization,
  accounts,
  funds,
  tags,
  names,
  defaultOpen,
  onDelete,
}: {
  month: string;
  items: BankEntryForCard[];
  summary: StatementSummary | null;
  marked: Set<string>;
  setMarked: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCategorization: React.Dispatch<React.SetStateAction<Record<string, { accountNumber: number | null; fundId: number | null; tagId: number | null }>>>;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  names: { accounts: Record<number, string>; funds: Record<number, string>; tags: Record<number, string> };
  defaultOpen: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<Kind>("check");

  const byKind: Record<Kind, BankEntryForCard[]> = { check: [], debit: [], credit: [] };
  for (const e of items) byKind[e.kind].push(e);
  byKind.check.sort((a, b) => (a.checkNumber ?? 0) - (b.checkNumber ?? 0));
  const counts = { check: byKind.check.length, debit: byKind.debit.length, credit: byKind.credit.length };

  const pendingNet = items
    .filter((e) => !marked.has(e.externalKey))
    .reduce((s, e) => s + e.amount, 0);

  const list = byKind[tab];
  const pendingTotal = list.filter((e) => !marked.has(e.externalKey)).reduce((s, e) => s + e.amount, 0);

  const renderCard = (e: BankEntryForCard) => (
    <BankCard
      key={e.externalKey}
      entry={e}
      accounts={accounts}
      funds={funds}
      tags={tags}
      accountsByNumber={names.accounts}
      fundsById={names.funds}
      tagsById={names.tags}
      manuallyEntered={marked.has(e.externalKey)}
      onMarkChange={(next) => {
        setMarked((prev) => {
          const n = new Set(prev);
          if (next) n.add(e.externalKey);
          else n.delete(e.externalKey);
          return n;
        });
      }}
      onCategorize={(patch) => {
        setCategorization((prev) => ({
          ...prev,
          [e.externalKey]: {
            accountNumber: "accountNumber" in patch ? (patch.accountNumber ?? null) : prev[e.externalKey].accountNumber,
            fundId: "fundId" in patch ? (patch.fundId ?? null) : prev[e.externalKey].fundId,
            tagId: "tagId" in patch ? (patch.tagId ?? null) : prev[e.externalKey].tagId,
          },
        }));
      }}
    />
  );

  return (
    <div className="border border-line rounded-xl bg-panel/50">
      <div className="flex items-center pr-[18px]">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between px-[18px] py-3.5 cursor-pointer hover:bg-line2/40 rounded-xl"
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
              {items.length} entries · {counts.check} checks · {counts.debit} debits · {counts.credit} credits
            </span>
          </div>
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">pending net</div>
            <div className={`font-display text-[16px] font-medium ${pendingNet >= 0 ? "text-forest" : "text-clay"}`}>
              {fmtUSD(pendingNet, { sign: true })}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete this statement and all its entries"
          className="ml-3 shrink-0 w-7 h-7 grid place-items-center rounded-lg text-ink3 hover:text-clay hover:bg-clay/10 cursor-pointer transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="px-[18px] pb-4 pt-1 flex flex-col gap-3">
          {summary && (
            <div className="bg-bg border border-line rounded-xl px-[18px] py-3 grid grid-cols-4 gap-4">
              <SummaryCell label="Beginning balance" value={summary.beginningBalance} />
              <SummaryCell label="Total additions" value={summary.totalAdditions} tone="forest" />
              <SummaryCell label="Total subtractions" value={summary.totalSubtractions} tone="clay" />
              <SummaryCell label="Ending balance" value={summary.endingBalance} />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1.5 rounded-full font-ui text-[12px] font-medium cursor-pointer ${
                    tab === k ? "bg-ink text-bg" : "bg-line2 text-ink2 hover:bg-line"
                  }`}
                >
                  {k === "check" ? "Checks" : k === "debit" ? "Debits" : "Credits"}
                  <span className="ml-1.5 font-mono text-[11px] opacity-70">{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="text-right">
              <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">tab pending</div>
              <div className={`font-display text-[14px] font-medium ${pendingTotal >= 0 ? "text-forest" : "text-clay"}`}>
                {fmtUSD(pendingTotal, { sign: true })}
              </div>
            </div>
          </div>

          {list.length === 0 && (
            <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
              No {tab}s in this statement.
            </div>
          )}

          <div className="flex flex-col gap-2.5">{list.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: number; tone?: "forest" | "clay" }) {
  const color = tone === "forest" ? "text-forest" : tone === "clay" ? "text-clay" : "text-ink";
  return (
    <div>
      <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">{label}</div>
      <div className={`font-display text-[16px] font-medium tabular-nums ${color}`}>{fmtUSD(value)}</div>
    </div>
  );
}
