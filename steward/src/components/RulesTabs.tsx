"use client";

import { useState } from "react";
import { RulesEditor } from "./RulesEditor";
import { SubsplashRulesEditor } from "./SubsplashRulesEditor";

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

export function RulesTabs({
  squareRules,
  subsplashGiftRules,
  subsplashPaymentRules,
  accounts,
  funds,
  tags,
  purposes,
  observedGiftFunds,
  observedPaymentSources,
}: {
  squareRules: Rule[];
  subsplashGiftRules: Rule[];
  subsplashPaymentRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  purposes: PurposeOpt[];
  observedGiftFunds: string[];
  observedPaymentSources: string[];
}) {
  const [tab, setTab] = useState<"square" | "subsplash">("square");

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-ui text-[12.5px] font-semibold border-b-2 cursor-pointer transition-colors ${
      active ? "border-forest text-ink" : "border-transparent text-ink3 hover:text-ink2"
    }`;

  // Square missing-rule warnings
  const squareMissingDefault = !squareRules.some((r) => r.pattern === "*");

  // Subsplash missing-rule warnings
  const giftFundsCovered = new Set(subsplashGiftRules.map((r) => r.pattern));
  const giftFundsMissing = observedGiftFunds.filter((f) => !giftFundsCovered.has(f));
  const paymentSourcesCovered = new Set(subsplashPaymentRules.map((r) => r.pattern));
  const paymentSourcesMissing = observedPaymentSources.filter((s) => !paymentSourcesCovered.has(s));
  const subsplashTotalMissing = giftFundsMissing.length + paymentSourcesMissing.length;

  return (
    <>
      <div className="px-8 border-b border-line flex gap-2">
        <button onClick={() => setTab("square")} className={tabClass(tab === "square")}>
          Square
          {squareMissingDefault && <span className="ml-1.5 text-honey">●</span>}
        </button>
        <button onClick={() => setTab("subsplash")} className={tabClass(tab === "subsplash")}>
          Subsplash
          {subsplashTotalMissing > 0 && (
            <span className="ml-1.5 text-honey">● {subsplashTotalMissing}</span>
          )}
        </button>
      </div>

      {tab === "square" && (
        <RulesEditor
          initialRules={squareRules.map((r) => ({
            ...r,
            accountNumber: r.accountNumber ?? 0,
            fundId: r.fundId ?? 0,
            tagId: r.tagId ?? 0,
          }))}
          accounts={accounts}
          funds={funds}
          tags={tags}
        />
      )}

      {tab === "subsplash" && (
        <SubsplashRulesEditor
          giftRules={subsplashGiftRules}
          paymentRules={subsplashPaymentRules}
          accounts={accounts}
          funds={funds}
          tags={tags}
          purposes={purposes}
          observedGiftFunds={observedGiftFunds}
          observedPaymentSources={observedPaymentSources}
        />
      )}
    </>
  );
}
