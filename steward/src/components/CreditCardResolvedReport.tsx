"use client";

import { useState, useRef, type DragEvent, type ReactNode } from "react";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";
import type { FlaggedRow, RowOverrides } from "@/lib/credit-card-mappings";
import { fmtUSD } from "@/lib/fmt";

type Status = "idle" | "processing" | "done" | "error" | "needs-rules";
type AccountOpt = { number: number; name: string };
type TagOpt = { id: number; name: string; fundId: number; fundName: string };
type Halt = { file: File; flagged: FlaggedRow[]; accounts: AccountOpt[]; tags: TagOpt[] };

// The X-Warnings header is base64 of UTF-8 JSON; atob alone yields Latin-1,
// which garbles the em dash into "â".
const decodeWarnings = (b64: string | null): string[] =>
  b64 ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))) : [];

export function CreditCardResolvedReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Held while halted on flagged rows, so we can re-run the same file.
  const [halt, setHalt] = useState<Halt | null>(null);
  // Per-row picks from the halt panel. Lives here, not in the panel, so they
  // survive a re-check; cleared when a different file is dropped.
  const [overrides, setOverrides] = useState<RowOverrides>({});

  const processNew = (file: File) => { setOverrides({}); process(file, {}); };

  const process = async (file: File, overrides: RowOverrides = {}) => {
    setStatus("processing");
    setErrorMsg(null);
    setWarnings([]);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("overrides", JSON.stringify(overrides));
      const res = await fetch("/api/credit-card/resolve-report", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      if (res.headers.get("Content-Type")?.includes("application/json")) {
        const body = await res.json();
        setHalt({ file, flagged: body.flagged, accounts: body.accounts, tags: body.tags });
        setStatus("needs-rules");
        return;
      }

      const rows = Number(res.headers.get("X-Row-Count") ?? 0);
      const warns = decodeWarnings(res.headers.get("X-Warnings"));

      const blob = await res.blob();
      const outName = file.name.replace(/\.csv$/i, "") + "-resolved.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName; a.click();
      URL.revokeObjectURL(url);

      setHalt(null);
      setLastFile(outName);
      setRowCount(rows);
      setWarnings(warns);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processNew(file);
  };

  const busy = status === "processing";

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`bg-panel border-2 border-dashed rounded-xl px-[18px] py-5 flex items-center justify-between gap-4 cursor-pointer transition-colors ${dragOver ? "border-forest bg-forest-soft/40" : "border-line hover:border-ink3"}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-forest-soft grid place-items-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="var(--color-forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-ui text-[13px] text-ink font-semibold">
              {busy ? "Processing…" : "Drop the filled-in expense report here"}
            </div>
            <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
              Expects the CSV with <em>Expense Type</em> and <em>Ministry</em> columns filled in. Downloads the same report with <em>Final Expense Account</em> and <em>Final Ministry</em> columns added.
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processNew(f); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            disabled={busy}
            className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60"
          >
            {busy ? "Processing…" : "Choose file"}
          </button>
          {status === "done" && lastFile && (
            <div className="font-ui text-[10.5px] text-ink3 max-w-[300px] text-right">
              Downloaded <span className="font-mono">{lastFile}</span> ({rowCount} rows)
            </div>
          )}
          {status === "error" && errorMsg && (
            <div className="font-ui text-[10.5px] text-clay max-w-[300px] text-right">{errorMsg}</div>
          )}
        </div>
      </div>

      {halt && (status === "needs-rules" || busy) && (
        <FlaggedPanel
          key={halt.flagged.map((u) => u.row).join(",")}
          halt={halt}
          busy={busy}
          overrides={overrides}
          setOverrides={setOverrides}
          onRecheck={() => process(halt.file, overrides)}
        />
      )}

      {warnings.length > 0 && (
        <div className="bg-panel border border-honey/40 rounded-xl px-[18px] py-3 font-ui text-[11.5px] text-ink2">
          <div className="font-semibold mb-1 text-ink">
            {warnings.length} warning(s) — defaulted to <span className="font-mono">5900 Miscellaneous Expenses</span>:
          </div>
          <ul className="list-disc pl-4 leading-tight">
            {warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
            {warnings.length > 20 && <li>… and {warnings.length - 20} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Halt panel ───────────────────────────────────────────────────────────────
// Typed-but-unknown text gets a rule form (one per distinct value); blank cells
// get a per-row pick. Every item must be resolved before re-checking.

// Mirrors classifyExpense / classifyMinistry: expense patterns are regexes,
// ministry patterns are plain substrings, both against the normalized text.
const expenseHit = (pattern: string, key: string) => {
  try { return new RegExp(pattern, "i").test(key); } catch { return false; }
};
const ministryHit = (pattern: string, key: string) => key !== "" && key.includes(pattern.toLowerCase());

function groupBy(rows: FlaggedRow[], key: (r: FlaggedRow) => string) {
  const m = new Map<string, FlaggedRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m];
}

function FlaggedPanel({
  halt, busy, overrides, setOverrides, onRecheck,
}: {
  halt: Halt;
  busy: boolean;
  overrides: RowOverrides;
  setOverrides: (f: (o: RowOverrides) => RowOverrides) => void;
  onRecheck: () => void;
}) {
  const { file, flagged, accounts, tags } = halt;
  // Patterns saved from this panel. A group counts as covered once any of them
  // matches its key — so a "book" rule also clears the "books" group.
  const [savedExpense, setSavedExpense] = useState<string[]>([]);
  const [savedMinistry, setSavedMinistry] = useState<{ pattern: string; tagId: number }[]>([]);
  const setOverride = (row: number, patch: { accountNumber?: number; tagId?: number }) =>
    setOverrides((o) => ({ ...o, [row]: { ...o[row], ...patch } }));

  const expenseGroups = groupBy(flagged.filter((r) => !r.expenseMatched && r.expenseKey), (r) => r.expenseKey);
  const ministryGroups = groupBy(flagged.filter((r) => !r.ministryMatched && r.ministryKey), (r) => r.ministryKey);
  const blankExpense = flagged.filter((r) => !r.expenseMatched && !r.expenseKey);
  const blankMinistry = flagged.filter((r) => !r.ministryMatched && !r.ministryKey);

  const expenseCovered = (key: string) => savedExpense.some((p) => expenseHit(p, key));
  const ministryRuleTag = (key: string) => savedMinistry.find((m) => ministryHit(m.pattern, key))?.tagId;
  const ministryCovered = (key: string) => ministryRuleTag(key) != null;
  const allPicked = (rows: FlaggedRow[]) => rows.every((r) => overrides[r.row]?.tagId);

  const remaining =
    expenseGroups.filter(([k]) => !expenseCovered(k)).length +
    ministryGroups.filter(([k, rows]) => !ministryCovered(k) && !allPicked(rows)).length +
    blankExpense.filter((r) => !overrides[r.row]?.accountNumber).length +
    blankMinistry.filter((r) => !overrides[r.row]?.tagId).length;

  const acctOpts: SearchableOption[] = accounts.map((a) => ({ value: a.number, label: `${a.number} — ${a.name}` }));
  const tagOpts: SearchableOption[] = tags.map((t) => ({ value: t.id, label: t.name, subLabel: t.fundName }));

  // Every row's final tag is editable — the rules' pick (or a just-saved
  // ministry rule's) shows as the default; changing it overrides that row only.
  const ministryPick = (r: FlaggedRow) => (
    <div className="w-48">
      <SearchableSelect
        options={tagOpts}
        value={overrides[r.row]?.tagId ?? (r.ministryMatched ? r.tagId : ministryRuleTag(r.ministryKey) ?? 0)}
        onChange={(v) => setOverride(r.row, { tagId: v || undefined })}
        placeholder="Ministry tag…"
      />
    </div>
  );

  return (
    <div className="bg-panel border border-honey/60 rounded-xl px-[18px] py-4 flex flex-col gap-4">
      <div>
        <div className="font-ui text-[13px] text-ink font-semibold">
          Stopped — {flagged.length} row(s) in <span className="font-mono">{file.name}</span> need an expense type or ministry
        </div>
        <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
          Each card is an expense type or ministry no rule matches. Save a rule for it (next month&apos;s report picks it
          up too) — or, where the cardholder left it blank, pick one per row. <em>Final ministry</em> on any row can be
          changed for just that row. The file downloads once every card is done.
        </div>
      </div>

      {expenseGroups.map(([key, rows]) => (
        <Card
          key={`e:${key}`}
          kind="Expense type"
          heading={`“${rows[0].expenseType}”`}
          rows={rows}
          ministryPick={ministryPick}
          done={expenseCovered(key) ? "rule saved" : null}
        >
          <RuleForm
            initialPattern={key}
            matches={(p) => expenseHit(p, key)}
            validPattern={(p) => { try { new RegExp(p); return true; } catch { return false; } }}
            options={acctOpts}
            placeholder="Expense account…"
            pickWidth="w-80"
            body={(pattern, accountNumber) => ({
              source: "credit-card-expense",
              matchType: "regex",
              pattern,
              accountNumber,
              priority: 0,
              label: `${rows[0].expenseType.trim()} → ${accountNumber}`,
            })}
            onSaved={(p) => setSavedExpense((s) => [...s, p])}
          />
        </Card>
      ))}

      {ministryGroups.map(([key, rows]) => (
        <Card
          key={`m:${key}`}
          kind="Ministry"
          heading={`“${rows[0].ministry}”`}
          rows={rows}
          ministryPick={ministryPick}
          done={ministryCovered(key) ? "rule saved" : allPicked(rows) ? "all picked" : null}
        >
          <RuleForm
            initialPattern={key}
            matches={(p) => ministryHit(p, key)}
            validPattern={() => true}
            options={tagOpts}
            placeholder="Ministry tag…"
            pickWidth="w-72"
            body={(pattern, tagId) => ({
              source: "credit-card-ministry",
              matchType: "contains",
              pattern,
              tagId,
              fundId: tags.find((t) => t.id === tagId)?.fundId,
              priority: 0,
              label: rows[0].ministry.trim(),
            })}
            onSaved={(p, tagId) => setSavedMinistry((s) => [...s, { pattern: p, tagId }])}
          />
        </Card>
      ))}

      {/* Blank cells have no text to write a rule against, so these cards take a pick per row instead. */}
      {blankExpense.length > 0 && (
        <Card
          kind="Expense type"
          heading="left blank"
          rows={blankExpense}
          ministryPick={ministryPick}
          done={blankExpense.every((r) => overrides[r.row]?.accountNumber) ? "all picked" : null}
          hide="Expense type"
          pickHeader="Account"
          pick={(r) => (
            <div className="w-56">
              <SearchableSelect
                options={acctOpts}
                value={overrides[r.row]?.accountNumber ?? 0}
                onChange={(v) => setOverride(r.row, { accountNumber: v || undefined })}
                placeholder="Expense account…"
              />
            </div>
          )}
        />
      )}

      {blankMinistry.length > 0 && (
        <Card
          kind="Ministry"
          heading="left blank"
          rows={blankMinistry}
          ministryPick={ministryPick}
          done={allPicked(blankMinistry) ? "all picked" : null}
          hide="Ministry"
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRecheck}
          disabled={busy || remaining > 0}
          className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {busy ? "Processing…" : "Re-check & download"}
        </button>
        <span className="font-ui text-[11px] text-ink3 ml-auto">
          {remaining === 0 ? "Everything is filled in" : `${remaining} item(s) still need filling in`}
        </span>
      </div>
    </div>
  );
}

function Card({
  kind, heading, rows, ministryPick, done, pickHeader, pick, hide, children,
}: {
  kind: "Expense type" | "Ministry";
  heading: string;
  rows: FlaggedRow[];
  ministryPick: (r: FlaggedRow) => ReactNode;
  done: string | null;
  pickHeader?: string;
  pick?: (r: FlaggedRow) => ReactNode;
  hide?: "Expense type" | "Ministry";  // a blank card's own column is all dashes
  children?: ReactNode;
}) {
  return (
    <div className={`border rounded-lg px-3.5 py-3 flex flex-col gap-2 ${done ? "border-forest/50 bg-forest-soft/30" : "border-line"}`}>
      <div className="font-ui text-[12.5px] text-ink font-semibold flex items-center gap-2">
        <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-ink3 border border-line rounded-full px-2 py-0.5">{kind}</span>
        {heading} <span className="text-ink3 font-normal">— {rows.length} row(s)</span>
        {done && <span className="text-forest">✓ {done}</span>}
      </div>
      <RowTable rows={rows} ministryPick={ministryPick} pickHeader={pickHeader} pick={pick} hide={hide} />
      {!done && children}
    </div>
  );
}

function RuleForm({
  initialPattern, matches, validPattern, options, placeholder, pickWidth, body, onSaved,
}: {
  initialPattern: string;
  matches: (pattern: string) => boolean;
  validPattern: (pattern: string) => boolean;
  options: SearchableOption[];
  placeholder: string;
  pickWidth: string;
  body: (pattern: string, value: number) => Record<string, unknown>;
  onSaved: (pattern: string, value: number) => void;
}) {
  const [pattern, setPattern] = useState(initialPattern);
  const [value, setValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = pattern.trim();
  const valid = p !== "" && validPattern(p);
  const matchesSelf = valid && matches(p);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(p, value)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(p, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const input = "font-mono text-[12px] bg-bg border border-line rounded-md px-2 py-1";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input className={input + " w-56"} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="pattern" />
      <span className="font-ui text-[11px] text-ink3">→</span>
      <div className={pickWidth}>
        <SearchableSelect options={options} value={value} onChange={(v) => setValue(v ?? 0)} placeholder={placeholder} />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !value || !matchesSelf}
        className="px-3 py-1.5 rounded-full bg-forest text-bg font-ui text-[11.5px] font-semibold cursor-pointer disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save rule"}
      </button>
      {valid && !matchesSelf && (
        <span className="font-ui text-[11px] text-clay">pattern doesn&apos;t match &ldquo;{initialPattern}&rdquo;</span>
      )}
      {!valid && p !== "" && <span className="font-ui text-[11px] text-clay">invalid pattern</span>}
      {error && <span className="font-ui text-[11px] text-clay">{error}</span>}
    </div>
  );
}

function RowTable({
  rows, ministryPick, pickHeader, pick, hide,
}: {
  rows: FlaggedRow[];
  ministryPick: (r: FlaggedRow) => ReactNode;
  pickHeader?: string;
  pick?: (r: FlaggedRow) => ReactNode;
  hide?: "Expense type" | "Ministry";
}) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full font-ui text-[11.5px] text-ink2">
      <thead>
        <tr className="text-left text-ink3 text-[10.5px] uppercase tracking-[0.06em]">
          <th className="font-medium py-1 w-12">Row</th>
          <th className="font-medium py-1 w-24">Date</th>
          <th className="font-medium py-1">Cardholder</th>
          <th className="font-medium py-1">Merchant</th>
          {hide !== "Expense type" && <th className="font-medium py-1">Expense type</th>}
          {hide !== "Ministry" && <th className="font-medium py-1">Ministry</th>}
          <th className="font-medium py-1 text-right">Amount</th>
          {pick && <th className="font-medium py-1 pl-3">{pickHeader}</th>}
          <th className="font-medium py-1 pl-3">Final ministry</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const n = Number(r.amount.replace(/[$,]/g, ""));
          const dash = <span className="text-ink3">—</span>;
          return (
            <tr key={r.row} className="border-t border-line">
              <td className="py-1 font-mono text-ink3">{r.row}</td>
              <td className="py-1 font-mono">{r.date}</td>
              <td className="py-1">{r.cardholder}</td>
              <td className="py-1">{r.merchant}</td>
              {hide !== "Expense type" && <td className="py-1">{r.expenseType || dash}</td>}
              {hide !== "Ministry" && (
                <td className="py-1">{r.ministry || dash}</td>
              )}
              <td className="py-1 font-mono text-right">{isFinite(n) ? fmtUSD(n) : r.amount}</td>
              {pick && <td className="py-1 pl-3">{pick(r)}</td>}
              <td className="py-1 pl-3">{ministryPick(r)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
