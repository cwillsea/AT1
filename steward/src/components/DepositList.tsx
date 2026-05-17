"use client";

import { useState } from "react";
import {
  PayoutCard,
  type DepositForCard,
  type NameTable,
  type AccountOpt,
  type FundOpt,
  type TagOpt,
  type NewRuleInput,
} from "./PayoutCard";
import { PostedShelf } from "./PostedShelf";
import { reclassifyDeposit, type Rule } from "@/lib/square-csv";

export function DepositList({
  deposits: initialDeposits,
  names,
  initialMarkedKeys,
  initialDeletedKeys,
  initialRules,
  accounts,
  funds,
  tags,
}: {
  deposits: DepositForCard[];
  names: NameTable;
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  initialRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));
  const [deposits, setDeposits] = useState<DepositForCard[]>(initialDeposits);
  const [rules, setRules] = useState<Rule[]>(initialRules);

  const setMark = (key: string, next: boolean) => {
    setMarked((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };
  const markDeleted = (key: string) => {
    setDeleted((prev) => {
      const out = new Set(prev);
      out.add(key);
      return out;
    });
  };

  // Add a rule via the API and re-classify every deposit client-side so the
  // page doesn't reload and the user keeps their scroll + expanded state.
  const addRule = async (input: NewRuleInput): Promise<void> => {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "square",
        matchType: "contains",
        pattern: input.pattern,
        priority: 50,
        accountNumber: input.accountNumber,
        fundId: input.fundId,
        tagId: input.tagId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { rule } = (await res.json()) as { rule: { id: number; pattern: string; matchType: string; priority: number; accountNumber: number; fundId: number; tagId: number } };
    const nextRules: Rule[] = [
      ...rules,
      {
        id: rule.id,
        pattern: rule.pattern,
        matchType: rule.matchType,
        priority: rule.priority,
        accountNumber: rule.accountNumber,
        fundId: rule.fundId,
        tagId: rule.tagId,
      },
    ];
    setRules(nextRules);
    setDeposits((prev) => prev.map((d) => reclassifyDeposit(d, nextRules)));
  };

  const visible = [...deposits].reverse().filter((d) => !deleted.has(d.id));
  const pending = visible.filter((d) => !marked.has(d.id));
  const posted = visible.filter((d) => marked.has(d.id));

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {pending.map((d) => (
          <PayoutCard
            key={d.id}
            deposit={d}
            names={names}
            defaultExpanded={false}
            manuallyPosted={false}
            onMarkChange={(next) => setMark(d.id, next)}
            onDelete={() => markDeleted(d.id)}
            accounts={accounts}
            funds={funds}
            tags={tags}
            onAddRule={addRule}
          />
        ))}
        {pending.length === 0 && (
          <div className="font-ui text-[12.5px] text-ink3 italic px-2">
            All caught up — every deposit has been marked posted or deleted.
          </div>
        )}
      </div>
      <PostedShelf count={posted.length}>
        {posted.map((d) => (
          <PayoutCard
            key={d.id}
            deposit={d}
            names={names}
            defaultExpanded={false}
            manuallyPosted={true}
            onMarkChange={(next) => setMark(d.id, next)}
            onDelete={() => markDeleted(d.id)}
            accounts={accounts}
            funds={funds}
            tags={tags}
            onAddRule={addRule}
          />
        ))}
      </PostedShelf>
    </>
  );
}
