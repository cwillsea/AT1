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
  purposeId: number | null;
  label: string | null;
};

type AccountOpt = { number: number; name: string; category: string | null };
type FundOpt = { id: number; name: string };
type TagOpt = { id: number; name: string; category: string | null };
type PurposeOpt = { id: number; name: string; incomeAccount: number | null; fundId: number | null };

const inputClass = "px-2 py-1 rounded border border-line bg-white font-ui text-[12px] text-ink focus:outline-none focus:border-forest";

export function SubsplashRulesEditor({
  giftRules: initialGiftRules,
  paymentRules: initialPaymentRules,
  accounts,
  funds,
  tags,
  purposes,
  observedGiftFunds,
  observedPaymentSources,
}: {
  giftRules: Rule[];
  paymentRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  purposes: PurposeOpt[];
  observedGiftFunds: string[];
  observedPaymentSources: string[];
}) {
  const router = useRouter();
  const [giftRules, setGiftRules] = useState(initialGiftRules);
  const [paymentRules, setPaymentRules] = useState(initialPaymentRules);
  const [busy, setBusy] = useState(false);
  const [pendingGiftPurposes, setPendingGiftPurposes] = useState<Map<string, number>>(new Map());
  const [pendingPaymentAccounts, setPendingPaymentAccounts] = useState<Map<string, number>>(new Map());
  const [pendingPaymentFunds, setPendingPaymentFunds] = useState<Map<string, number>>(new Map());
  const [pendingPaymentTags, setPendingPaymentTags] = useState<Map<string, number>>(new Map());

  // GIFT helpers — single field: purpose
  const upsertGiftRule = async (pattern: string, purposeId: number) => {
    setPendingGiftPurposes((prev) => new Map(prev).set(pattern, purposeId));
    setBusy(true);
    try {
      const existing = giftRules.find((r) => r.pattern === pattern);
      if (existing) {
        const res = await fetch(`/api/rules/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purposeId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { rule } = (await res.json()) as { rule: Rule };
        setGiftRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
      } else {
        const res = await fetch(`/api/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "subsplash-gift",
            matchType: "exact",
            pattern,
            priority: 100,
            purposeId,
            // sentinel zeros — required by current api but unused for gift rules
            accountNumber: 0,
            fundId: 0,
            tagId: 0,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { rule } = (await res.json()) as { rule: Rule };
        setGiftRules((prev) => [...prev, rule].sort((a, b) => a.pattern.localeCompare(b.pattern)));
      }
      router.refresh();
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // PAYMENT helpers — three fields: account / fund / tag
  const upsertPaymentRule = async (
    pattern: string,
    accountNumber: number,
    fundId: number,
    tagId: number,
  ) => {
    setPendingPaymentAccounts((prev) => new Map(prev).set(pattern, accountNumber));
    setPendingPaymentFunds((prev) => new Map(prev).set(pattern, fundId));
    setPendingPaymentTags((prev) => new Map(prev).set(pattern, tagId));
    setBusy(true);
    try {
      const existing = paymentRules.find((r) => r.pattern === pattern);
      if (existing) {
        const res = await fetch(`/api/rules/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNumber, fundId, tagId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { rule } = (await res.json()) as { rule: Rule };
        setPaymentRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
      } else {
        const res = await fetch(`/api/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "subsplash-payment",
            matchType: "exact",
            pattern,
            priority: 100,
            accountNumber,
            fundId,
            tagId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { rule } = (await res.json()) as { rule: Rule };
        setPaymentRules((prev) => [...prev, rule].sort((a, b) => a.pattern.localeCompare(b.pattern)));
      }
      router.refresh();
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (id: number, kind: "gift" | "payment") => {
    if (!confirm("Delete this rule?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      if (kind === "gift") setGiftRules((prev) => prev.filter((r) => r.id !== id));
      else setPaymentRules((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Build the unified row list per section: union of observed + already-ruled patterns.
  const giftPatterns = Array.from(new Set([...observedGiftFunds, ...giftRules.map((r) => r.pattern)])).sort();
  const paymentPatterns = Array.from(new Set([...observedPaymentSources, ...paymentRules.map((r) => r.pattern)])).sort();

  // Count rows (patterns) that have at least one rule — avoids "7 of 6"
  // when duplicate rules exist for the same pattern.
  const giftMappedCount = giftPatterns.filter((p) => giftRules.some((r) => r.pattern === p)).length;
  const paymentMappedCount = paymentPatterns.filter((p) => paymentRules.some((r) => r.pattern === p)).length;

  const purposeOptions: SearchableOption[] = purposes.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const accountOptions: SearchableOption[] = accounts.map((a) => ({
    value: a.number,
    label: a.name,
    subLabel: String(a.number),
    group: a.category === "income" ? "Income" : a.category === "expense" ? "Expense" : undefined,
  }));
  const fundOptions: SearchableOption[] = funds.map((f) => ({
    value: f.id,
    label: f.name,
    subLabel: String(f.id),
  }));
  const tagOptions: SearchableOption[] = tags.map((t) => ({
    value: t.id,
    label: t.name,
    subLabel: String(t.id),
  }));

  return (
    <div className="px-8 py-5 flex flex-col gap-6">
      {/* GIFT FUNDS → PURPOSE */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.08em] uppercase">Gift fund → Aplos purpose</div>
            <div className="font-display text-[18px] text-ink mt-0.5">Tithe, Kingdom Builders, etc.</div>
          </div>
          <div className="font-ui text-[11.5px] text-ink3">
            {giftMappedCount} of {giftPatterns.length} fund{giftPatterns.length === 1 ? "" : "s"} mapped
          </div>
        </div>

        <div className="bg-panel border border-line rounded-2xl">
          <div className="grid grid-cols-[1.4fr_2fr_5rem] bg-line2 border-b border-line rounded-t-2xl overflow-hidden">
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Subsplash fund (CSV value)</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Aplos purpose</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase text-right">Actions</div>
          </div>
          {giftPatterns.length === 0 && (
            <div className="px-4 py-3 font-ui text-[12px] text-ink3 italic">
              No gift funds observed yet. Upload a Subsplash gifts CSV to populate this list.
            </div>
          )}
          {giftPatterns.map((pattern) => {
            const rule = giftRules.find((r) => r.pattern === pattern);
            const noRule = !rule;
            return (
              <div
                key={pattern}
                className={`grid grid-cols-[1.4fr_2fr_5rem] border-b border-line2 items-center ${noRule ? "bg-honey-soft/30" : ""}`}
              >
                <div className="px-3 py-2.5">
                  <div className="font-ui text-[12.5px] text-ink font-medium">{pattern}</div>
                  {noRule && (
                    <div className="font-ui text-[10.5px] text-honey font-semibold mt-0.5">No rule yet</div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={pendingGiftPurposes.get(pattern) ?? rule?.purposeId ?? 0}
                    disabled={busy}
                    placeholder="— pick a purpose —"
                    options={purposeOptions}
                    onChange={(v) => { if (v > 0) upsertGiftRule(pattern, v); }}
                  />
                  {rule?.purposeId && (
                    (() => {
                      const p = purposes.find((x) => x.id === rule.purposeId);
                      if (!p) return null;
                      return (
                        <div className="font-ui text-[10px] text-ink3 mt-1">
                          → posts to acct {p.incomeAccount ?? "?"} · fund {p.fundId ?? "?"}
                        </div>
                      );
                    })()
                  )}
                </div>
                <div className="px-3 py-2.5 text-right">
                  {rule && (
                    <button
                      onClick={() => deleteRule(rule.id, "gift")}
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

      {/* PAYMENT SOURCES → ACCOUNT/FUND/TAG */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.08em] uppercase">Payment source → Aplos account / fund / ministry</div>
            <div className="font-display text-[18px] text-ink mt-0.5">Academy Pizza Wednesday, Youth Camp, etc.</div>
          </div>
          <div className="font-ui text-[11.5px] text-ink3">
            {paymentMappedCount} of {paymentPatterns.length} source{paymentPatterns.length === 1 ? "" : "s"} mapped
          </div>
        </div>

        <div className="bg-panel border border-line rounded-2xl">
          <div className="grid grid-cols-[1.6fr_1.2fr_1.2fr_1.2fr_5rem] bg-line2 border-b border-line rounded-t-2xl overflow-hidden">
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Payment source</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Account</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Fund</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase">Ministry</div>
            <div className="px-3 py-2 font-ui text-[10px] text-ink3 tracking-[0.06em] uppercase text-right">Actions</div>
          </div>
          {paymentPatterns.length === 0 && (
            <div className="px-4 py-3 font-ui text-[12px] text-ink3 italic">
              No payment sources observed yet. Upload a Subsplash payments CSV to populate this list.
            </div>
          )}
          {paymentPatterns.map((pattern) => {
            const rule = paymentRules.find((r) => r.pattern === pattern);
            const noRule = !rule;
            return (
              <div
                key={pattern}
                className={`grid grid-cols-[1.6fr_1.2fr_1.2fr_1.2fr_5rem] border-b border-line2 items-center ${noRule ? "bg-honey-soft/30" : ""}`}
              >
                <div className="px-3 py-2.5">
                  <div className="font-ui text-[12.5px] text-ink font-medium">{pattern}</div>
                  {noRule && (
                    <div className="font-ui text-[10.5px] text-honey font-semibold mt-0.5">No rule yet</div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={pendingPaymentAccounts.get(pattern) ?? rule?.accountNumber ?? 0}
                    disabled={busy}
                    options={accountOptions}
                    onChange={(n) => {
                      if (n <= 0) return;
                      const fund = pendingPaymentFunds.get(pattern) ?? rule?.fundId ?? 0;
                      const tag = pendingPaymentTags.get(pattern) ?? rule?.tagId ?? 0;
                      if (fund > 0 && tag > 0) upsertPaymentRule(pattern, n, fund, tag);
                      else setPendingPaymentAccounts((prev) => new Map(prev).set(pattern, n));
                    }}
                  />
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={pendingPaymentFunds.get(pattern) ?? rule?.fundId ?? 0}
                    disabled={busy}
                    options={fundOptions}
                    onChange={(n) => {
                      if (n <= 0) return;
                      const account = pendingPaymentAccounts.get(pattern) ?? rule?.accountNumber ?? 0;
                      const tag = pendingPaymentTags.get(pattern) ?? rule?.tagId ?? 0;
                      if (account > 0 && tag > 0) upsertPaymentRule(pattern, account, n, tag);
                      else setPendingPaymentFunds((prev) => new Map(prev).set(pattern, n));
                    }}
                  />
                </div>
                <div className="px-3 py-2.5">
                  <SearchableSelect
                    value={pendingPaymentTags.get(pattern) ?? rule?.tagId ?? 0}
                    disabled={busy}
                    options={tagOptions}
                    onChange={(n) => {
                      if (n <= 0) return;
                      const account = pendingPaymentAccounts.get(pattern) ?? rule?.accountNumber ?? 0;
                      const fund = pendingPaymentFunds.get(pattern) ?? rule?.fundId ?? 0;
                      if (account > 0 && fund > 0) upsertPaymentRule(pattern, account, fund, n);
                      else setPendingPaymentTags((prev) => new Map(prev).set(pattern, n));
                    }}
                  />
                </div>
                <div className="px-3 py-2.5 text-right">
                  {rule && (
                    <button
                      onClick={() => deleteRule(rule.id, "payment")}
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
        <strong>How matching works:</strong> Subsplash already classifies each gift by Fund and each
        payment by Payment source — those values are exact-matched against rules above. Rows highlighted
        in honey have no rule yet, so they&apos;d post with placeholder targets. Pick a target from the
        dropdown to save instantly.
      </div>
    </div>
  );
}

