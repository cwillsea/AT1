"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { FlowDiagram } from "./FlowDiagram";
import { SearchableSelect } from "./SearchableSelect";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import type { ClassifiedRow, RollupLine } from "@/lib/square-csv";

export type AccountOpt = { number: number; name: string; category: string | null };
export type FundOpt = { id: number; name: string };
export type TagOpt = { id: number; name: string; category: string | null };

export type NewRuleInput = {
  pattern: string;
  accountNumber: number;
  fundId: number;
  tagId: number;
};

export type DepositForCard = {
  id: string;
  date: string;
  payoutAmount: number;
  itemCount: number;
  totalGross: number;
  totalFees: number;
  netTotal: number;
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

// A row is "unmatched" when classification couldn't find any rule for it —
// classifyRow surfaces that as account 0.
function isUnmatched(r: { accountNumber: number }) {
  return r.accountNumber === 0;
}

export function PayoutCard({
  deposit,
  names,
  defaultExpanded = false,
  manuallyPosted,
  onMarkChange,
  onDelete,
  accounts,
  funds,
  tags,
  onAddRule,
}: {
  deposit: DepositForCard;
  names: NameTable;
  defaultExpanded?: boolean;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onAddRule: (input: NewRuleInput) => Promise<void>;
}) {
  const unmatchedRows = deposit.rows.filter(isUnmatched);
  const hasUnmatched = unmatchedRows.length > 0;
  // Open the card automatically if the user has work to do on it.
  const [expanded, setExpanded] = useState(defaultExpanded || hasUnmatched);
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
    if (hasUnmatched) return; // belt + suspenders; the input is also disabled
    const next = !manuallyPosted;
    if (!next && !confirm("Unmark this deposit as posted?")) return;
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

  const lockTitle = hasUnmatched
    ? `Resolve ${unmatchedRows.length} unmatched item${unmatchedRows.length === 1 ? "" : "s"} first`
    : undefined;

  return (
    <div className={`bg-panel border rounded-2xl overflow-hidden transition-colors ${
      hasUnmatched ? "border-honey/60 bg-honey-soft/20"
      : manuallyPosted ? "border-forest/40 bg-forest-soft/30"
      : "border-line"
    }`}>
      {/* Header row */}
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
          <div className="flex items-center gap-2">
            <SourceChip src="square" />
            <span className="font-ui text-[13px] text-ink font-semibold">Square deposit</span>
            <span className="font-ui text-[11.5px] text-ink3">· {deposit.itemCount} items</span>
            {hasUnmatched && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-honey/20 border border-honey/40 font-ui text-[10.5px] font-semibold text-honey">
                {unmatchedRows.length} need rule{unmatchedRows.length === 1 ? "" : "s"}
              </span>
            )}
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
        <label
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-2 select-none ${hasUnmatched ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          title={lockTitle ?? "Mark as already posted to Aplos manually"}
        >
          <input
            type="checkbox"
            checked={manuallyPosted}
            onChange={toggleManuallyPosted}
            disabled={savingMark || hasUnmatched}
            className="w-4 h-4 accent-forest"
          />
          <span className={`font-ui text-[11.5px] ${manuallyPosted ? "text-forest font-semibold" : "text-ink2"}`}>
            Manually posted
          </span>
        </label>
        <div onClick={(e) => e.stopPropagation()} className="flex gap-2">
          <button
            disabled
            title={hasUnmatched ? lockTitle : "API posting not wired yet — use Manually posted for now"}
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
                {[...deposit.rows]
                  .sort((a, b) => Number(isUnmatched(b)) - Number(isUnmatched(a)))
                  .map((r, i) => (
                  <SourceRow
                    key={i}
                    row={r}
                    names={names}
                    accounts={accounts}
                    funds={funds}
                    tags={tags}
                    onAddRule={onAddRule}
                  />
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
                {deposit.rollup.map((r) => {
                  const unmatched = isUnmatched(r);
                  return (
                    <div
                      key={`${r.accountNumber}-${r.fundId}-${r.tagId}`}
                      className={`px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.4fr_1.1fr_1fr_auto] gap-2 items-start ${unmatched ? "bg-honey-soft/40" : ""}`}
                    >
                      <div>
                        <div className={`font-ui text-[12px] font-medium leading-tight ${unmatched ? "text-honey" : "text-ink"}`}>
                          {unmatched ? "Unmatched — no rule" : nameOr(names.accounts, r.accountNumber, "Account")}
                        </div>
                        <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.accountNumber}</div>
                      </div>
                      <div>
                        <div className="font-ui text-[11.5px] text-ink leading-tight">{unmatched ? "—" : nameOr(names.funds, r.fundId, "Fund")}</div>
                        <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.fundId}</div>
                      </div>
                      <div>
                        <div className="font-ui text-[11.5px] text-ink leading-tight">{unmatched ? "—" : nameOr(names.tags, r.tagId, "Tag")}</div>
                        <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.tagId}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-[12px] font-semibold ${unmatched ? "text-honey" : "text-forest"}`}>{fmtUSD(r.amount, { sign: true })}</div>
                        <div className="font-ui text-[10px] text-ink3 mt-0.5">{r.count} item{r.count > 1 ? "s" : ""}</div>
                      </div>
                    </div>
                  );
                })}
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

// One line in the itemized source list. Renders normally for matched rows, or
// in amber with an "Add rule" affordance for unmatched ones.
function SourceRow({
  row,
  names,
  accounts,
  funds,
  tags,
  onAddRule,
}: {
  row: ClassifiedRow;
  names: NameTable;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onAddRule: (input: NewRuleInput) => Promise<void>;
}) {
  const [addingRule, setAddingRule] = useState(false);
  const unmatched = isUnmatched(row);

  return (
    <div className={`border-b border-line2 ${unmatched ? "bg-honey-soft/40" : ""}`}>
      <div className="px-3.5 py-2.5 grid grid-cols-[1fr_auto_auto] gap-2.5 items-start">
        <div className="min-w-0">
          <div className="font-ui text-[12px] text-ink whitespace-nowrap overflow-hidden text-ellipsis">
            {row.description || "(no description)"}
          </div>
          <div className={`font-ui text-[10.5px] mt-0.5 ${unmatched ? "text-honey font-semibold" : "text-ink3"}`}>
            {unmatched
              ? "No rule matches — add one to categorize this and any future items containing the same text"
              : `→ ${nameOr(names.accounts, row.accountNumber, "Account")} · ${nameOr(names.tags, row.tagId, "Tag")}`}
          </div>
        </div>
        {unmatched && !addingRule && (
          <button
            onClick={() => setAddingRule(true)}
            className="px-2.5 py-1 rounded-full bg-honey text-bg font-ui text-[10.5px] font-semibold cursor-pointer"
          >
            + Add rule
          </button>
        )}
        <div className="text-right">
          <div className={`font-mono text-[11.5px] font-semibold ${unmatched ? "text-honey" : "text-forest"}`}>
            {fmtUSD(row.totalCollected, { sign: true })}
          </div>
          <div className="font-mono text-[9.5px] text-ink3 mt-0.5">
            fee {fmtUSD(row.fees)}
          </div>
        </div>
      </div>
      {unmatched && addingRule && (
        <InlineRuleForm
          description={row.description}
          accounts={accounts}
          funds={funds}
          tags={tags}
          onCancel={() => setAddingRule(false)}
          onSave={async (input) => {
            await onAddRule(input);
            setAddingRule(false);
          }}
        />
      )}
    </div>
  );
}

function suggestPattern(description: string): string {
  // Default to the lowercased description trimmed — user can shorten before saving.
  return description.trim().toLowerCase();
}

function InlineRuleForm({
  description,
  accounts,
  funds,
  tags,
  onCancel,
  onSave,
}: {
  description: string;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onCancel: () => void;
  onSave: (input: NewRuleInput) => Promise<void>;
}) {
  const [pattern, setPattern] = useState(() => suggestPattern(description));
  const [accountNumber, setAccountNumber] = useState<number>(accounts[0]?.number ?? 0);
  const [fundId, setFundId] = useState<number>(funds[0]?.id ?? 0);
  const [tagId, setTagId] = useState<number>(tags[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = pattern.trim();
    if (!trimmed) { setError("Pattern can't be empty"); return; }
    if (trimmed === "*") { setError("Catch-all rules are no longer supported"); return; }
    if (!accountNumber || !fundId || !tagId) { setError("Pick account, fund, and ministry"); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({ pattern: trimmed, accountNumber, fundId, tagId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "px-2 py-1 rounded border border-line bg-white font-ui text-[11.5px] text-ink focus:outline-none focus:border-forest";

  return (
    <div className="px-3.5 pb-3 pt-1 grid gap-2 bg-honey-soft/60 border-t border-honey/30">
      <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
        <label className="font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Match (contains)</label>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className={`${inputClass} w-full font-mono`}
          placeholder="e.g. youth"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1">
          <label className="font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">Account</label>
          <SearchableSelect
            value={accountNumber}
            onChange={setAccountNumber}
            allowEmpty={false}
            options={accounts.map((a) => ({
              value: a.number,
              label: `${a.name}${a.category ? ` (${a.category})` : ""}`,
              subLabel: String(a.number),
            }))}
          />
        </div>
        <div className="grid gap-1">
          <label className="font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">Fund</label>
          <SearchableSelect
            value={fundId}
            onChange={setFundId}
            allowEmpty={false}
            options={funds.map((f) => ({ value: f.id, label: f.name, subLabel: String(f.id) }))}
          />
        </div>
        <div className="grid gap-1">
          <label className="font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">Ministry</label>
          <SearchableSelect
            value={tagId}
            onChange={setTagId}
            allowEmpty={false}
            options={tags.map((t) => ({
              value: t.id,
              label: `${t.name}${t.category ? ` (${t.category})` : ""}`,
              subLabel: String(t.id),
            }))}
          />
        </div>
      </div>
      <div className="flex justify-between items-center mt-1">
        <div className="font-ui text-[10.5px] text-ink3 italic">
          Tip: shorten the pattern to catch variants — e.g. <span className="font-mono">youth</span> instead of the full description.
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-2.5 py-1 rounded-full border border-line font-ui text-[11px] text-ink2 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 rounded-full bg-forest text-bg font-ui text-[11px] font-semibold cursor-pointer disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
      {error && <div className="font-ui text-[11px] text-clay">{error}</div>}
    </div>
  );
}
