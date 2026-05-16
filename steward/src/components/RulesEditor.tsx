"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Rule = {
  id: number;
  source: string;
  matchType: string;
  pattern: string;
  priority: number;
  accountNumber: number;
  fundId: number;
  tagId: number;
  label: string | null;
};

type AccountOpt = { number: number; name: string; category: string | null };
type FundOpt = { id: number; name: string };
type TagOpt = { id: number; name: string; category: string | null };

const inputClass = "px-2 py-1 rounded border border-line bg-white font-ui text-[12px] text-ink focus:outline-none focus:border-forest";

function Select({
  value,
  onChange,
  children,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${inputClass} cursor-pointer ${className}`}
    >
      {children}
    </select>
  );
}

export function RulesEditor({
  initialRules,
  accounts,
  funds,
  tags,
}: {
  initialRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Rule> | null>(null);
  const [adding, setAdding] = useState<Partial<Rule> | null>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setDraft({ ...rule });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      const { rule } = (await res.json()) as { rule: Rule };
      setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r))
        .sort((a, b) => b.priority - a.priority || a.id - b.id));
      cancelEdit();
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
      if (editingId === id) cancelEdit();
      router.refresh();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    setAdding({
      source: "square",
      matchType: "contains",
      pattern: "",
      priority: 0,
      accountNumber: accounts[0]?.number ?? 0,
      fundId: funds[0]?.id ?? 0,
      tagId: tags[0]?.id ?? 0,
      label: "",
    });
  };

  const submitAdd = async () => {
    if (!adding) return;
    if (!adding.pattern) { alert("Pattern is required (use \"*\" for catch-all)"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adding),
      });
      if (!res.ok) throw new Error(await res.text());
      const { rule } = (await res.json()) as { rule: Rule };
      setRules((prev) => [...prev, rule].sort((a, b) => b.priority - a.priority || a.id - b.id));
      setAdding(null);
      router.refresh();
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const accountOptions = (
    <>
      {accounts.map((a) => (
        <option key={a.number} value={a.number}>
          {a.accountNumber ?? a.number} — {a.name}{a.category ? ` (${a.category})` : ""}
        </option>
      ))}
    </>
  );
  const fundOptions = (
    <>
      {funds.map((f) => (
        <option key={f.id} value={f.id}>{f.id} — {f.name}</option>
      ))}
    </>
  );
  const tagOptions = (
    <>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>{t.id} — {t.name}{t.category ? ` (${t.category})` : ""}</option>
      ))}
    </>
  );

  const headerClass = "px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase";
  const cellClass = "px-3 py-2.5 align-top";

  return (
    <div className="px-8 py-5 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="font-ui text-[12px] text-ink3">
          {rules.length} rule{rules.length === 1 ? "" : "s"} · evaluated highest priority first
        </div>
        <button
          onClick={startAdd}
          disabled={busy || adding !== null}
          className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60"
        >
          + New rule
        </button>
      </div>

      <div className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[60px_1.5fr_2fr_1.5fr_1.5fr_1.5fr_auto] bg-line2 border-b border-line">
          <div className={headerClass + " text-right"}>Pri</div>
          <div className={headerClass}>Pattern</div>
          <div className={headerClass}>Label</div>
          <div className={headerClass}>Account</div>
          <div className={headerClass}>Fund</div>
          <div className={headerClass}>Ministry</div>
          <div className={headerClass + " text-right"}>Actions</div>
        </div>

        {adding && (
          <div className="grid grid-cols-[60px_1.5fr_2fr_1.5fr_1.5fr_1.5fr_auto] border-b border-line2 bg-forest-soft/40">
            <div className={cellClass}>
              <input type="number" value={adding.priority ?? 0} onChange={(e) => setAdding({ ...adding, priority: Number(e.target.value) })} className={`${inputClass} w-full text-right`} />
            </div>
            <div className={cellClass}>
              <input type="text" value={adding.pattern ?? ""} onChange={(e) => setAdding({ ...adding, pattern: e.target.value })} placeholder='e.g. "youth" or "*"' className={`${inputClass} w-full`} />
            </div>
            <div className={cellClass}>
              <input type="text" value={adding.label ?? ""} onChange={(e) => setAdding({ ...adding, label: e.target.value })} placeholder="Optional friendly label" className={`${inputClass} w-full`} />
            </div>
            <div className={cellClass}>
              <Select value={adding.accountNumber ?? 0} onChange={(n) => setAdding({ ...adding, accountNumber: n })} className="w-full">{accountOptions}</Select>
            </div>
            <div className={cellClass}>
              <Select value={adding.fundId ?? 0} onChange={(n) => setAdding({ ...adding, fundId: n })} className="w-full">{fundOptions}</Select>
            </div>
            <div className={cellClass}>
              <Select value={adding.tagId ?? 0} onChange={(n) => setAdding({ ...adding, tagId: n })} className="w-full">{tagOptions}</Select>
            </div>
            <div className={cellClass + " text-right flex gap-1.5 justify-end"}>
              <button onClick={submitAdd} disabled={busy} className="px-3 py-1.5 rounded-full bg-forest text-bg font-ui text-[11px] font-semibold cursor-pointer disabled:opacity-60">Add</button>
              <button onClick={() => setAdding(null)} disabled={busy} className="px-3 py-1.5 rounded-full border border-line font-ui text-[11px] text-ink2 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        {rules.map((rule) => {
          const editing = editingId === rule.id;
          const r = editing && draft ? draft : rule;
          return (
            <div key={rule.id} className={`grid grid-cols-[60px_1.5fr_2fr_1.5fr_1.5fr_1.5fr_auto] border-b border-line2 ${editing ? "bg-honey-soft/30" : ""}`}>
              <div className={cellClass + " text-right"}>
                {editing ? (
                  <input type="number" value={r.priority ?? 0} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} className={`${inputClass} w-full text-right`} />
                ) : (
                  <span className="font-mono text-[12px] text-ink2">{rule.priority}</span>
                )}
              </div>
              <div className={cellClass}>
                {editing ? (
                  <input type="text" value={r.pattern ?? ""} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} className={`${inputClass} w-full`} />
                ) : (
                  <span className="font-mono text-[12px] text-ink">{rule.pattern === "*" ? <em className="text-ink3">* (catch-all)</em> : rule.pattern}</span>
                )}
              </div>
              <div className={cellClass}>
                {editing ? (
                  <input type="text" value={r.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={`${inputClass} w-full`} />
                ) : (
                  <span className="font-ui text-[12px] text-ink2">{rule.label ?? <span className="text-ink3">—</span>}</span>
                )}
              </div>
              <div className={cellClass}>
                {editing ? (
                  <Select value={r.accountNumber ?? 0} onChange={(n) => setDraft({ ...draft, accountNumber: n })} className="w-full">{accountOptions}</Select>
                ) : (
                  <div>
                    <div className="font-ui text-[12px] text-ink">{accounts.find((a) => a.number === rule.accountNumber)?.name ?? `Account ${rule.accountNumber}`}</div>
                    <div className="font-mono text-[10px] text-ink3 mt-0.5">{rule.accountNumber}</div>
                  </div>
                )}
              </div>
              <div className={cellClass}>
                {editing ? (
                  <Select value={r.fundId ?? 0} onChange={(n) => setDraft({ ...draft, fundId: n })} className="w-full">{fundOptions}</Select>
                ) : (
                  <div>
                    <div className="font-ui text-[12px] text-ink">{funds.find((f) => f.id === rule.fundId)?.name ?? `Fund ${rule.fundId}`}</div>
                    <div className="font-mono text-[10px] text-ink3 mt-0.5">{rule.fundId}</div>
                  </div>
                )}
              </div>
              <div className={cellClass}>
                {editing ? (
                  <Select value={r.tagId ?? 0} onChange={(n) => setDraft({ ...draft, tagId: n })} className="w-full">{tagOptions}</Select>
                ) : (
                  <div>
                    <div className="font-ui text-[12px] text-ink">{tags.find((t) => t.id === rule.tagId)?.name ?? `Tag ${rule.tagId}`}</div>
                    <div className="font-mono text-[10px] text-ink3 mt-0.5">{rule.tagId}</div>
                  </div>
                )}
              </div>
              <div className={cellClass + " text-right flex gap-1.5 justify-end items-start"}>
                {editing ? (
                  <>
                    <button onClick={saveEdit} disabled={busy} className="px-3 py-1.5 rounded-full bg-forest text-bg font-ui text-[11px] font-semibold cursor-pointer disabled:opacity-60">Save</button>
                    <button onClick={cancelEdit} disabled={busy} className="px-3 py-1.5 rounded-full border border-line font-ui text-[11px] text-ink2 cursor-pointer">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(rule)} disabled={busy} className="px-3 py-1.5 rounded-full border border-line font-ui text-[11px] text-ink2 cursor-pointer">Edit</button>
                    <button onClick={() => deleteRule(rule.id)} disabled={busy} className="px-3 py-1.5 rounded-full border border-clay/30 font-ui text-[11px] text-clay cursor-pointer">Delete</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="font-ui text-[11.5px] text-ink3 max-w-2xl">
        <strong>How matching works:</strong> Each Square line item&apos;s description is lowercased
        and checked against rules from highest priority down. The first matching rule wins. Pattern{" "}
        <span className="font-mono">*</span> matches everything (catch-all). After editing here,{" "}
        <strong>reload the Square imports page</strong> and the cards re-classify automatically — no
        re-sync needed.
      </div>
    </div>
  );
}
