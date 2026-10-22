"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";

type Rule = {
  id: number;
  source: string;
  matchType: string;
  pattern: string;
  priority: number;
  accountNumber: number | null;
  fundId: number | null;
  tagId: number | null;
  label: string | null;
};

type AccountOpt = { number: number; name: string; category: string | null };
type FundOpt = { id: number; name: string };
type TagOpt = { id: number; name: string; category: string | null };

const input = "px-2 py-1 rounded border border-line bg-white font-ui text-[12px] text-ink focus:outline-none focus:border-forest";

export function CreditCardRulesEditor({
  expenseRules,
  ministryRules,
  merchantRules,
  accounts,
  funds,
  tags,
}: {
  expenseRules: Rule[];
  ministryRules: Rule[];
  merchantRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
}) {
  return (
    <div className="px-8 py-5 flex flex-col gap-6">
      <ExpenseSection initial={expenseRules} accounts={accounts} />
      <MinistrySection initial={ministryRules} funds={funds} tags={tags} />
      <MerchantSection initial={merchantRules} />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createRule(body: Record<string, unknown>): Promise<Rule> {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as { rule: Rule }).rule;
}
async function patchRule(id: number, body: Record<string, unknown>): Promise<Rule> {
  const res = await fetch(`/api/rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as { rule: Rule }).rule;
}
async function deleteRule(id: number): Promise<void> {
  const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

function SectionHeader({ title, sub, count }: { title: string; sub: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line pb-2">
      <div>
        <div className="font-display text-[18px] text-ink font-medium">{title}</div>
        <div className="font-ui text-[11px] text-ink3 mt-0.5">{sub}</div>
      </div>
      <div className="font-ui text-[11px] text-ink3">{count} rule{count === 1 ? "" : "s"}</div>
    </div>
  );
}

// ── Expense section ──────────────────────────────────────────────────────────

function ExpenseSection({ initial, accounts }: { initial: Rule[]; accounts: AccountOpt[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState<{ pattern: string; accountNumber: number; label: string; priority: number } | null>(null);
  const acctOpts: SearchableOption[] = accounts.map((a) => ({ value: a.number, label: `${a.number} — ${a.name}` }));

  const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const edit = async (id: number, body: Record<string, unknown>) => {
    try {
      const updated = await patchRule(id, body);
      setRules((r) => r.map((x) => (x.id === id ? updated : x)));
      router.refresh();
    } catch (e) { alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const add = async () => {
    if (!draft) return;
    try {
      const rule = await createRule({
        source: "credit-card-expense",
        matchType: "regex",
        pattern: draft.pattern,
        priority: draft.priority,
        accountNumber: draft.accountNumber,
        label: draft.label || null,
      });
      setRules((r) => [...r, rule]);
      setDraft(null);
      router.refresh();
    } catch (e) { alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await deleteRule(id);
      setRules((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } catch (e) { alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Expense type rules" sub="Regex match on the Expense Type column → Aplos account. Click any field to edit; changes save when you leave the field." count={rules.length} />
      <table className="w-full font-ui text-[12px]">
        <thead className="text-ink3">
          <tr><th className="text-left py-1 w-20">Priority</th><th className="text-left py-1">Pattern (regex)</th><th className="text-left py-1">Account</th><th className="text-left py-1">Label</th><th className="w-12"></th></tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1"><input className={input + " w-14"} type="number" defaultValue={r.priority} onBlur={(e) => e.target.value !== String(r.priority) && edit(r.id, { priority: Number(e.target.value) })} /></td>
              <td className="py-1 pr-2"><input className={input + " w-full font-mono"} defaultValue={r.pattern} onBlur={(e) => e.target.value !== r.pattern && edit(r.id, { pattern: e.target.value })} /></td>
              <td className="py-1 pr-2 w-80"><SearchableSelect options={acctOpts} value={r.accountNumber ?? 0} onChange={(v) => v && v !== r.accountNumber && edit(r.id, { accountNumber: v })} placeholder="Account…" allowEmpty={false} /></td>
              <td className="py-1"><input className={input + " w-full"} defaultValue={r.label ?? ""} onBlur={(e) => e.target.value !== (r.label ?? "") && edit(r.id, { label: e.target.value || null })} /></td>
              <td className="py-1 text-right">
                <button className="text-clay cursor-pointer" onClick={() => remove(r.id)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft ? (
        <div className="border-t border-line pt-2 flex gap-2 items-center">
          <input className={input + " w-16"} type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          <input className={input + " flex-1 font-mono"} placeholder="regex e.g. fellowship meal" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
          <div className="w-72"><SearchableSelect options={acctOpts} value={draft.accountNumber} onChange={(v) => setDraft({ ...draft, accountNumber: v ?? 0 })} placeholder="Account…" /></div>
          <input className={input + " w-48"} placeholder="label (optional)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <button className="px-2 py-1 bg-forest text-bg rounded font-semibold cursor-pointer" onClick={add}>Add</button>
          <button className="px-2 py-1 text-ink3 cursor-pointer" onClick={() => setDraft(null)}>Cancel</button>
        </div>
      ) : (
        <button className="self-start font-ui text-[12px] text-forest font-semibold cursor-pointer" onClick={() => setDraft({ pattern: "", accountNumber: 0, label: "", priority: 0 })}>+ Add expense rule</button>
      )}
    </section>
  );
}

// ── Ministry section ─────────────────────────────────────────────────────────

function MinistrySection({ initial, funds, tags }: { initial: Rule[]; funds: FundOpt[]; tags: TagOpt[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState<{ pattern: string; fundId: number; tagId: number; label: string; priority: number } | null>(null);
  const fundOpts: SearchableOption[] = funds.map((f) => ({ value: f.id, label: f.name }));
  const tagOpts: SearchableOption[] = tags.map((t) => ({ value: t.id, label: t.name }));

  const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const add = async () => {
    if (!draft) return;
    try {
      const rule = await createRule({
        source: "credit-card-ministry",
        matchType: "contains",
        pattern: draft.pattern,
        priority: draft.priority,
        fundId: draft.fundId,
        tagId: draft.tagId,
        label: draft.label || null,
      });
      setRules((r) => [...r, rule]);
      setDraft(null);
      router.refresh();
    } catch (e) { alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try { await deleteRule(id); setRules((r) => r.filter((x) => x.id !== id)); router.refresh(); }
    catch (e) { alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const edit = async (id: number, body: Record<string, unknown>) => {
    try {
      const updated = await patchRule(id, body);
      setRules((r) => r.map((x) => (x.id === id ? updated : x)));
      router.refresh();
    } catch (e) { alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Ministry rules" sub="Substring match on the Ministry column → Aplos fund + tag. Click any field to edit; changes save when you leave the field." count={rules.length} />
      <table className="w-full font-ui text-[12px]">
        <thead className="text-ink3">
          <tr><th className="text-left py-1 w-20">Priority</th><th className="text-left py-1">Pattern (contains)</th><th className="text-left py-1">Fund</th><th className="text-left py-1">Tag</th><th className="text-left py-1">Label</th><th className="w-12"></th></tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1"><input className={input + " w-14"} type="number" defaultValue={r.priority} onBlur={(e) => e.target.value !== String(r.priority) && edit(r.id, { priority: Number(e.target.value) })} /></td>
              <td className="py-1 pr-2"><input className={input + " w-full font-mono"} defaultValue={r.pattern} onBlur={(e) => e.target.value !== r.pattern && edit(r.id, { pattern: e.target.value })} /></td>
              <td className="py-1 pr-2 w-44"><SearchableSelect options={fundOpts} value={r.fundId ?? 0} onChange={(v) => v && v !== r.fundId && edit(r.id, { fundId: v })} placeholder="Fund…" allowEmpty={false} /></td>
              <td className="py-1 pr-2 w-52"><SearchableSelect options={tagOpts} value={r.tagId ?? 0} onChange={(v) => v && v !== r.tagId && edit(r.id, { tagId: v })} placeholder="Tag…" allowEmpty={false} /></td>
              <td className="py-1"><input className={input + " w-full"} defaultValue={r.label ?? ""} onBlur={(e) => e.target.value !== (r.label ?? "") && edit(r.id, { label: e.target.value || null })} /></td>
              <td className="py-1 text-right"><button className="text-clay cursor-pointer" onClick={() => remove(r.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft ? (
        <div className="border-t border-line pt-2 flex gap-2 items-center flex-wrap">
          <input className={input + " w-16"} type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          <input className={input + " flex-1 font-mono min-w-[180px]"} placeholder="e.g. mothers day" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
          <div className="w-44"><SearchableSelect options={fundOpts} value={draft.fundId} onChange={(v) => setDraft({ ...draft, fundId: v ?? 0 })} placeholder="Fund…" /></div>
          <div className="w-48"><SearchableSelect options={tagOpts} value={draft.tagId} onChange={(v) => setDraft({ ...draft, tagId: v ?? 0 })} placeholder="Tag…" /></div>
          <input className={input + " w-44"} placeholder="label (optional)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <button className="px-2 py-1 bg-forest text-bg rounded font-semibold cursor-pointer" onClick={add}>Add</button>
          <button className="px-2 py-1 text-ink3 cursor-pointer" onClick={() => setDraft(null)}>Cancel</button>
        </div>
      ) : (
        <button className="self-start font-ui text-[12px] text-forest font-semibold cursor-pointer" onClick={() => setDraft({ pattern: "", fundId: 0, tagId: 0, label: "", priority: 0 })}>+ Add ministry rule</button>
      )}
    </section>
  );
}

// ── Merchant aliases section ─────────────────────────────────────────────────

function MerchantSection({ initial }: { initial: Rule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState<{ pattern: string; label: string; priority: number } | null>(null);

  const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const add = async () => {
    if (!draft) return;
    try {
      const rule = await createRule({
        source: "credit-card-merchant",
        matchType: "regex",
        pattern: draft.pattern,
        priority: draft.priority,
        label: draft.label,
      });
      setRules((r) => [...r, rule]);
      setDraft(null);
      router.refresh();
    } catch (e) { alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try { await deleteRule(id); setRules((r) => r.filter((x) => x.id !== id)); router.refresh(); }
    catch (e) { alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const edit = async (id: number, field: "pattern" | "label" | "priority", value: string) => {
    try {
      const body: Record<string, unknown> = field === "priority" ? { priority: Number(value) } : { [field]: value };
      const updated = await patchRule(id, body);
      setRules((r) => r.map((x) => (x.id === id ? updated : x)));
    } catch (e) { alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Merchant aliases" sub="Cleans up noisy merchant strings (AMAZON MKTPL*xxx → Amazon). Cosmetic only — does not affect Aplos posting." count={rules.length} />
      <table className="w-full font-ui text-[12px]">
        <thead className="text-ink3">
          <tr><th className="text-left py-1 w-20">Priority</th><th className="text-left py-1">Pattern (regex)</th><th className="text-left py-1">Display name</th><th className="w-12"></th></tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-line group">
              <td className="py-1"><input className={input + " w-14"} defaultValue={r.priority} onBlur={(e) => e.target.value !== String(r.priority) && edit(r.id, "priority", e.target.value)} /></td>
              <td className="py-1"><input className={input + " w-full font-mono"} defaultValue={r.pattern} onBlur={(e) => e.target.value !== r.pattern && edit(r.id, "pattern", e.target.value)} /></td>
              <td className="py-1"><input className={input + " w-full"} defaultValue={r.label ?? ""} onBlur={(e) => e.target.value !== (r.label ?? "") && edit(r.id, "label", e.target.value)} /></td>
              <td className="py-1 text-right"><button className="text-clay cursor-pointer" onClick={() => remove(r.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft ? (
        <div className="border-t border-line pt-2 flex gap-2 items-center">
          <input className={input + " w-16"} type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          <input className={input + " flex-1 font-mono"} placeholder="regex e.g. amazon|amzn" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
          <input className={input + " w-64"} placeholder="display name e.g. Amazon" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <button className="px-2 py-1 bg-forest text-bg rounded font-semibold cursor-pointer" onClick={add}>Add</button>
          <button className="px-2 py-1 text-ink3 cursor-pointer" onClick={() => setDraft(null)}>Cancel</button>
        </div>
      ) : (
        <button className="self-start font-ui text-[12px] text-forest font-semibold cursor-pointer" onClick={() => setDraft({ pattern: "", label: "", priority: 0 })}>+ Add merchant alias</button>
      )}
    </section>
  );
}
