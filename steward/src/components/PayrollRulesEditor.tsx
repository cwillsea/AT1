"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";

type Rule = {
  id: number;
  pattern: string;
  accountNumber: number | null;
  fundId: number | null;
  tagId: number | null;
};

type AccountOpt = { number: number; name: string; category: string | null };
type FundOpt = { id: number; name: string };
type TagOpt = { id: number; name: string; category: string | null };

type Target = { accountNumber: number; fundId: number; tagId: number };

// Recipient name → account / fund / ministry. Same row-per-pattern layout as
// the Subsplash payment-source editor: every recipient seen in an uploaded
// payroll CSV gets a row, and picking all three targets saves the rule.
export function PayrollRulesEditor({
  rules: initialRules,
  accounts,
  funds,
  tags,
  observedRecipients,
}: {
  rules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  observedRecipients: string[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState(false);
  // Partial picks for rows that don't have all three targets yet.
  const [draft, setDraft] = useState<Map<string, Partial<Target>>>(new Map());

  const findRule = (pattern: string) =>
    rules.find((r) => r.pattern.trim().toLowerCase() === pattern.trim().toLowerCase());

  const upsert = async (pattern: string, t: Target) => {
    setBusy(true);
    try {
      const existing = findRule(pattern);
      const res = existing
        ? await fetch(`/api/rules/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(t),
          })
        : await fetch(`/api/rules`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "payroll", matchType: "exact", pattern, priority: 100, ...t }),
          });
      if (!res.ok) throw new Error(await res.text());
      const { rule } = (await res.json()) as { rule: Rule };
      setRules((prev) => (existing ? prev.map((r) => (r.id === rule.id ? rule : r)) : [...prev, rule]));
      setDraft((prev) => { const out = new Map(prev); out.delete(pattern); return out; });
      router.refresh();
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setRules((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = (pattern: string, field: keyof Target, value: number) => {
    if (value <= 0) return;
    const rule = findRule(pattern);
    const merged: Partial<Target> = {
      accountNumber: rule?.accountNumber ?? undefined,
      fundId: rule?.fundId ?? undefined,
      tagId: rule?.tagId ?? undefined,
      ...draft.get(pattern),
      [field]: value,
    };
    if (merged.accountNumber && merged.fundId && merged.tagId) upsert(pattern, merged as Target);
    else setDraft((prev) => new Map(prev).set(pattern, merged));
  };

  const ruled = new Set(rules.map((r) => r.pattern.trim().toLowerCase()));
  const patterns = [
    ...observedRecipients.filter((p) => !ruled.has(p.trim().toLowerCase())),
    ...rules.map((r) => r.pattern),
  ].sort((a, b) => a.localeCompare(b));
  const mappedCount = patterns.filter((p) => findRule(p)).length;

  const accountOptions: SearchableOption[] = accounts.map((a) => ({
    value: a.number,
    label: a.name,
    subLabel: String(a.number),
    group: a.category === "income" ? "Income" : a.category === "expense" ? "Expense" : undefined,
  }));
  const fundOptions: SearchableOption[] = funds.map((f) => ({ value: f.id, label: f.name, subLabel: String(f.id) }));
  const tagOptions: SearchableOption[] = tags.map((t) => ({ value: t.id, label: t.name, subLabel: String(t.id) }));

  const cols = "grid-cols-[1.6fr_1.2fr_1.2fr_1.2fr_5rem]";

  return (
    <div className="px-8 py-5 flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.08em] uppercase">Payroll recipient → Aplos account / fund / ministry</div>
            <div className="font-display text-[18px] text-ink mt-0.5">One rule per person on payroll</div>
          </div>
          <div className="font-ui text-[11.5px] text-ink3">
            {mappedCount} of {patterns.length} recipient{patterns.length === 1 ? "" : "s"} mapped
          </div>
        </div>

        <div className="bg-panel border border-line rounded-2xl">
          <div className={`grid ${cols} bg-line2 border-b border-line rounded-t-2xl overflow-hidden`}>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Recipient name</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Account</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Fund</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Ministry</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase text-right">Actions</div>
          </div>
          {patterns.length === 0 && (
            <div className="px-4 py-3 font-ui text-[12px] text-ink3 italic">
              No recipients observed yet. Upload a payroll CSV on the Payroll page to populate this list.
            </div>
          )}
          {patterns.map((pattern) => {
            const rule = findRule(pattern);
            const d = draft.get(pattern);
            return (
              <div key={pattern} className={`grid ${cols} border-b border-line2 items-center ${rule ? "" : "bg-honey-soft/30"}`}>
                <div className="px-3 py-2.5">
                  <div className="font-ui text-[12.5px] text-ink font-medium">{pattern}</div>
                  {!rule && <div className="font-ui text-[10.5px] text-honey font-semibold mt-0.5">No rule yet</div>}
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={d?.accountNumber ?? rule?.accountNumber ?? 0}
                    disabled={busy}
                    options={accountOptions}
                    onChange={(n) => pick(pattern, "accountNumber", n)}
                  />
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={d?.fundId ?? rule?.fundId ?? 0}
                    disabled={busy}
                    options={fundOptions}
                    onChange={(n) => pick(pattern, "fundId", n)}
                  />
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={d?.tagId ?? rule?.tagId ?? 0}
                    disabled={busy}
                    options={tagOptions}
                    onChange={(n) => pick(pattern, "tagId", n)}
                  />
                </div>
                <div className="px-3 py-2.5 text-right">
                  {rule && (
                    <button
                      onClick={() => deleteRule(rule.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-full border border-clay/30 text-clay font-ui text-[11px] cursor-pointer disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="font-ui text-[11.5px] text-ink3 max-w-2xl">
        <strong>How matching works:</strong> each recipient&apos;s <span className="font-mono">Recipient Name</span> from
        the Truist ACH export is matched exactly (ignoring case) against these rules. Rows highlighted in honey have no
        rule yet and block the Aplos import. Pick all three targets to save.
      </div>
    </div>
  );
}
