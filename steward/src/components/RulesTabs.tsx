"use client";

import { useState } from "react";
import { RulesEditor } from "./RulesEditor";
import { SubsplashRulesEditor } from "./SubsplashRulesEditor";
import { CreditCardRulesEditor } from "./CreditCardRulesEditor";
import { PayrollRulesEditor } from "./PayrollRulesEditor";

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
  creditCardExpenseRules,
  creditCardMinistryRules,
  creditCardMerchantRules,
  payrollRules,
  accounts,
  funds,
  tags,
  purposes,
  observedGiftFunds,
  observedPaymentSources,
  observedPayrollRecipients,
}: {
  squareRules: Rule[];
  subsplashGiftRules: Rule[];
  subsplashPaymentRules: Rule[];
  creditCardExpenseRules: Rule[];
  creditCardMinistryRules: Rule[];
  creditCardMerchantRules: Rule[];
  payrollRules: Rule[];
  accounts: AccountOpt[];
  funds: FundOpt[];
  tags: TagOpt[];
  purposes: PurposeOpt[];
  observedGiftFunds: string[];
  observedPaymentSources: string[];
  observedPayrollRecipients: string[];
}) {
  const [tab, setTab] = useState<"square" | "subsplash" | "credit-card" | "payroll">("square");

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-ui text-[12.5px] font-semibold border-b-2 cursor-pointer transition-colors ${
      active ? "border-forest text-ink" : "border-transparent text-ink3 hover:text-ink2"
    }`;

  // Subsplash missing-rule warnings
  const giftFundsCovered = new Set(subsplashGiftRules.map((r) => r.pattern));
  const giftFundsMissing = observedGiftFunds.filter((f) => !giftFundsCovered.has(f));
  const paymentSourcesCovered = new Set(subsplashPaymentRules.map((r) => r.pattern));
  const paymentSourcesMissing = observedPaymentSources.filter((s) => !paymentSourcesCovered.has(s));
  const subsplashTotalMissing = giftFundsMissing.length + paymentSourcesMissing.length;
  const payrollCovered = new Set(payrollRules.map((r) => r.pattern.trim().toLowerCase()));
  const payrollMissing = observedPayrollRecipients.filter((n) => !payrollCovered.has(n.trim().toLowerCase())).length;

  return (
    <>
      <div className="px-8 border-b border-line flex gap-2">
        <button onClick={() => setTab("square")} className={tabClass(tab === "square")}>
          Square
        </button>
        <button onClick={() => setTab("subsplash")} className={tabClass(tab === "subsplash")}>
          Subsplash
          {subsplashTotalMissing > 0 && (
            <span className="ml-1.5 text-honey">● {subsplashTotalMissing}</span>
          )}
        </button>
        <button onClick={() => setTab("credit-card")} className={tabClass(tab === "credit-card")}>
          Credit Card
        </button>
        <button onClick={() => setTab("payroll")} className={tabClass(tab === "payroll")}>
          Payroll
          {payrollMissing > 0 && <span className="ml-1.5 text-honey">● {payrollMissing}</span>}
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

      {tab === "credit-card" && (
        <CreditCardRulesEditor
          expenseRules={creditCardExpenseRules}
          ministryRules={creditCardMinistryRules}
          merchantRules={creditCardMerchantRules}
          accounts={accounts}
          funds={funds}
          tags={tags}
        />
      )}

      {tab === "payroll" && (
        <PayrollRulesEditor
          rules={payrollRules}
          accounts={accounts}
          funds={funds}
          tags={tags}
          observedRecipients={observedPayrollRecipients}
        />
      )}
    </>
  );
}
