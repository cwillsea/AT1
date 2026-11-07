"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import { SearchableSelect } from "./SearchableSelect";
import type { AccountOpt, FundOpt, TagOpt, NameTable, NewRuleInput } from "./PayoutCard";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";
import { recipientsTotal, type PayrollBatch, type ClassifiedRecipient } from "@/lib/payroll-csv";

const CASH_ACCOUNT = 1110;
// Pre-selected in the inline rule form; the treasurer can change any of them.
const DEFAULT_ACCOUNT = 5110; // "Salaries & Wages"
const DEFAULT_FUND = 521243;  // "General Fund"
const DEFAULT_TAG = 339561;   // "General"

function nameOr(table: Record<number, string>, id: number, prefix: string) {
  return table[id] ?? `${prefix} ${id}`;
}

function isUnmatched(r: { accountNumber: number }) {
  return r.accountNumber === 0;
}

export function PayrollCard({
  batch,
  names,
  manuallyPosted,
  onMarkChange,
  onDelete,
  accounts,
  funds,
  tags,
  onAddRule,
}: {
  batch: PayrollBatch;
  names: NameTable;
  manuallyPosted: boolean;
  onMarkChange: (next: boolean) => void;
  onDelete: () => void;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onAddRule: (input: NewRuleInput) => Promise<void>;
}) {
  const unmatched = batch.recipients.filter(isUnmatched);
  const hasUnmatched = unmatched.length > 0;
  const total = recipientsTotal(batch);
  const totalMismatch = Math.abs(total - batch.amount) > 0.005;
  const [expanded, setExpanded] = useState(hasUnmatched);
  const [savingMark, setSavingMark] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete payroll batch ${batch.trackingId}? It will disappear from this view (re-uploading its CSV brings it back).`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: batch.id, source: "payroll", deleted: true }),
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
    if (hasUnmatched) return;
    const next = !manuallyPosted;
    onMarkChange(next); // optimistic
    setSavingMark(true);
    try {
      const res = await fetch("/api/manual-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalKey: batch.id, source: "payroll", marked: next }),
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
    ? `Resolve ${unmatched.length} unmatched recipient${unmatched.length === 1 ? "" : "s"} first`
    : undefined;

  return (
    <div className={`bg-panel border rounded-2xl overflow-hidden transition-colors ${
      hasUnmatched ? "border-honey/60 bg-honey-soft/20"
      : manuallyPosted ? "border-forest/40 bg-forest-soft/30"
      : "border-line"
    }`}>
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
            <SourceChip src="truist" />
            <span className="font-ui text-[13px] text-ink font-semibold">Payroll ACH</span>
            <span className="font-ui text-[11.5px] text-ink3">
              · {batch.recipients.length} recipient{batch.recipients.length === 1 ? "" : "s"}
            </span>
            {batch.status && batch.status !== "Processed" && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-line2 border border-line font-ui text-[10.5px] font-semibold text-ink2">
                {batch.status}
              </span>
            )}
            {hasUnmatched && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-honey/20 border border-honey/40 font-ui text-[10.5px] font-semibold text-honey">
                {unmatched.length} need rule{unmatched.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            Effective {fmtShortDate(batch.effectiveDate)} · tracking <span className="font-mono">{batch.trackingId}</span>
            {batch.fromAccount ? ` · ${batch.fromAccount}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] text-clay font-medium tracking-tight">
            {fmtUSD(-batch.amount)}
          </div>
          {totalMismatch && (
            <div className="font-ui text-[10.5px] text-honey font-semibold mt-0.5">
              recipients sum to {fmtUSD(total)}
            </div>
          )}
        </div>
        <label
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-2 select-none ${hasUnmatched ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          title={lockTitle ?? "Mark as already posted to Aplos"}
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
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Hide this batch from the view"
            className="px-2.5 py-2 rounded-full border border-clay/30 text-clay font-ui text-[12px] cursor-pointer disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-bg px-[18px] py-4 grid grid-cols-[1fr_1.2fr] gap-4">
          {/* Recipients */}
          <div className="bg-panel border border-line rounded-[10px] overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-line2">
              <div className="font-ui text-[10px] text-ink3 tracking-[0.08em] uppercase">Source detail</div>
              <div className="font-ui text-[12.5px] text-ink font-semibold mt-0.5">
                {batch.description || "Payroll"} · {batch.recipients.length} recipient{batch.recipients.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="max-h-80 overflow-auto">
              {[...batch.recipients]
                .sort((a, b) => Number(isUnmatched(b)) - Number(isUnmatched(a)))
                .map((r, i) => (
                  <RecipientRow
                    key={`${r.name}-${i}`}
                    recipient={r}
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
                {batch.recipients.length} expense line{batch.recipients.length === 1 ? "" : "s"} + cash from {nameOr(names.accounts, CASH_ACCOUNT, "Account")}
              </div>
            </div>
            <div className="px-3.5 py-1.5 grid grid-cols-[1.2fr_1.3fr_1fr_1fr_auto] gap-2 items-center bg-line2 font-ui text-[9.5px] text-ink3 tracking-[0.06em] uppercase">
              <div>Comment</div>
              <div>Account</div>
              <div>Fund</div>
              <div>Ministry</div>
              <div className="text-right">Amount</div>
            </div>
            {batch.recipients.map((r, i) => {
              const u = isUnmatched(r);
              return (
                <div
                  key={`${r.name}-${i}`}
                  className={`px-3.5 py-2.5 border-b border-line2 grid grid-cols-[1.2fr_1.3fr_1fr_1fr_auto] gap-2 items-start ${u ? "bg-honey-soft/40" : ""}`}
                >
                  <div className="font-ui text-[12px] text-ink leading-tight">{r.name}</div>
                  <div>
                    <div className={`font-ui text-[12px] font-medium leading-tight ${u ? "text-honey" : "text-ink"}`}>
                      {u ? "Unmatched — no rule" : nameOr(names.accounts, r.accountNumber, "Account")}
                    </div>
                    <div className="font-mono text-[10px] text-ink3 mt-0.5">{r.accountNumber}</div>
                  </div>
                  <div className="font-ui text-[11.5px] text-ink leading-tight">{u ? "—" : nameOr(names.funds, r.fundId, "Fund")}</div>
                  <div className="font-ui text-[11.5px] text-ink leading-tight">{u ? "—" : nameOr(names.tags, r.tagId, "Tag")}</div>
                  <div className={`font-mono text-[12px] font-semibold text-right ${u ? "text-honey" : "text-clay"}`}>{fmtUSD(-r.amount)}</div>
                </div>
              );
            })}
            <div className="px-3.5 py-3 grid grid-cols-[1fr_auto] gap-2.5 items-center bg-forest-soft border-t border-line">
              <div>
                <div className="font-ui text-[12px] text-forest font-semibold">Cash ← {nameOr(names.accounts, CASH_ACCOUNT, "Account")}</div>
                <div className="font-mono text-[10px] text-forest/70 mt-0.5">{CASH_ACCOUNT}</div>
              </div>
              <div className="font-mono text-[13px] text-forest font-bold">{fmtUSD(-batch.amount)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecipientRow({
  recipient: r,
  names,
  accounts,
  funds,
  tags,
  onAddRule,
}: {
  recipient: ClassifiedRecipient;
  names: NameTable;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onAddRule: (input: NewRuleInput) => Promise<void>;
}) {
  const [addingRule, setAddingRule] = useState(false);
  const unmatched = isUnmatched(r);

  return (
    <div className={`border-b border-line2 ${unmatched ? "bg-honey-soft/40" : ""}`}>
      <div className="px-3.5 py-2.5 grid grid-cols-[1fr_auto_auto] gap-2.5 items-start">
        <div className="min-w-0">
          <div className="font-ui text-[12px] text-ink whitespace-nowrap overflow-hidden text-ellipsis">
            {r.name}
            {r.achName && r.achName !== r.name && <span className="text-ink3"> (ACH: {r.achName})</span>}
            {r.accountLast4 && <span className="font-mono text-[10px] text-ink3"> ••{r.accountLast4}</span>}
          </div>
          <div className={`font-ui text-[10.5px] mt-0.5 ${unmatched ? "text-honey font-semibold" : "text-ink3"}`}>
            {unmatched
              ? "No rule for this recipient — add one and every batch they appear in is categorized"
              : `→ ${nameOr(names.accounts, r.accountNumber, "Account")} · ${nameOr(names.funds, r.fundId, "Fund")} · ${nameOr(names.tags, r.tagId, "Tag")}`}
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
        <div className={`font-mono text-[11.5px] font-semibold text-right ${unmatched ? "text-honey" : "text-clay"}`}>
          {fmtUSD(-r.amount)}
        </div>
      </div>
      {unmatched && addingRule && (
        <InlineRuleForm
          recipientName={r.name}
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

function InlineRuleForm({
  recipientName,
  accounts,
  funds,
  tags,
  onCancel,
  onSave,
}: {
  recipientName: string;
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  onCancel: () => void;
  onSave: (input: NewRuleInput) => Promise<void>;
}) {
  const pick = <T,>(list: T[], has: (x: T) => boolean, fallback: number, get: (x: T) => number) =>
    list.some(has) ? fallback : list[0] ? get(list[0]) : 0;
  const [accountNumber, setAccountNumber] = useState(() => pick(accounts, (a) => a.number === DEFAULT_ACCOUNT, DEFAULT_ACCOUNT, (a) => a.number));
  const [fundId, setFundId] = useState(() => pick(funds, (f) => f.id === DEFAULT_FUND, DEFAULT_FUND, (f) => f.id));
  const [tagId, setTagId] = useState(() => pick(tags, (t) => t.id === DEFAULT_TAG, DEFAULT_TAG, (t) => t.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!accountNumber || !fundId || !tagId) { setError("Pick account, fund, and ministry"); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({ pattern: recipientName, accountNumber, fundId, tagId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3.5 pb-3 pt-1 grid gap-2 bg-honey-soft/60 border-t border-honey/30">
      <div className="font-ui text-[10.5px] text-ink3">
        Rule for recipient <span className="font-semibold text-ink">{recipientName}</span> (exact name match)
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
            options={tags.map((t) => ({ value: t.id, label: t.name, subLabel: String(t.id) }))}
          />
        </div>
      </div>
      <div className="flex justify-end items-center gap-1.5 mt-1">
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
      {error && <div className="font-ui text-[11px] text-clay">{error}</div>}
    </div>
  );
}
