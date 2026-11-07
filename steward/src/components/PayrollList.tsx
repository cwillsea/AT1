"use client";

import { useState } from "react";
import { PayrollCard } from "./PayrollCard";
import { PostedShelf } from "./PostedShelf";
import type { AccountOpt, FundOpt, TagOpt, NameTable, NewRuleInput } from "./PayoutCard";
import { classifyBatch, type PayrollBatch, type PayrollRule } from "@/lib/payroll-csv";

export function PayrollList({
  batches: initialBatches,
  names,
  initialMarkedKeys,
  initialDeletedKeys,
  initialRules,
  accounts,
  funds,
  tags,
}: {
  batches: PayrollBatch[];
  names: NameTable;
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  initialRules: PayrollRule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));
  const [batches, setBatches] = useState<PayrollBatch[]>(initialBatches);
  const [rules, setRules] = useState<PayrollRule[]>(initialRules);

  const setMark = (key: string, next: boolean) => {
    setMarked((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };
  const markDeleted = (key: string) => {
    setDeleted((prev) => new Set(prev).add(key));
  };

  // Save the rule, then re-classify every batch client-side — the same
  // employee shows up in most batches, so one rule clears them all.
  const addRule = async (input: NewRuleInput): Promise<void> => {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "payroll",
        matchType: "exact",
        pattern: input.pattern,
        priority: 100,
        accountNumber: input.accountNumber,
        fundId: input.fundId,
        tagId: input.tagId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { rule } = (await res.json()) as { rule: PayrollRule };
    const nextRules = [...rules, { id: rule.id, pattern: rule.pattern, accountNumber: rule.accountNumber, fundId: rule.fundId, tagId: rule.tagId }];
    setRules(nextRules);
    setBatches((prev) => prev.map((b) => classifyBatch(b, nextRules)));
  };

  const visible = batches.filter((b) => !deleted.has(b.id));
  const pending = visible.filter((b) => !marked.has(b.id));
  const posted = visible.filter((b) => marked.has(b.id));

  const card = (b: PayrollBatch, manuallyPosted: boolean) => (
    <PayrollCard
      key={b.id}
      batch={b}
      names={names}
      manuallyPosted={manuallyPosted}
      onMarkChange={(next) => setMark(b.id, next)}
      onDelete={() => markDeleted(b.id)}
      accounts={accounts}
      funds={funds}
      tags={tags}
      onAddRule={addRule}
    />
  );

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {pending.map((b) => card(b, false))}
        {pending.length === 0 && (
          <div className="font-ui text-[12.5px] text-ink3 italic px-2">
            {visible.length === 0
              ? "No payroll batches yet — upload a CSV above."
              : "All caught up — every batch has been marked posted or deleted."}
          </div>
        )}
      </div>
      <PostedShelf count={posted.length}>{posted.map((b) => card(b, true))}</PostedShelf>
    </>
  );
}
