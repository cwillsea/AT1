"use client";

import { useState } from "react";
import { CreditCardUploader } from "./CreditCardUploader";
import { CreditCardAplosImporter } from "./CreditCardAplosImporter";
import { CreditCardResolvedReport } from "./CreditCardResolvedReport";

export function CreditCardTabs() {
  const [tab, setTab] = useState<"template" | "resolved" | "aplos">("template");

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-ui text-[12.5px] font-semibold border-b-2 cursor-pointer transition-colors ${
      active ? "border-forest text-ink" : "border-transparent text-ink3 hover:text-ink2"
    }`;

  const step = (n: number) => (
    <span className="font-mono text-[10.5px] text-ink3 mr-1.5">{n}</span>
  );

  return (
    <>
      <div className="px-8 border-b border-line flex gap-2">
        <button onClick={() => setTab("template")} className={tabClass(tab === "template")}>
          {step(1)}Expense Report Template
        </button>
        <button onClick={() => setTab("resolved")} className={tabClass(tab === "resolved")}>
          {step(2)}Resolved Report
        </button>
        <button onClick={() => setTab("aplos")} className={tabClass(tab === "aplos")}>
          {step(3)}Aplos Import
        </button>
      </div>

      <div className="px-8 py-5 flex flex-col gap-3.5">
        {tab === "template" && (
          <>
            <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 leading-normal">
              Download your CSV from Truist Online Banking under <strong>Commercial Card → Transaction Details → Download</strong>.
              Drop it below — the transformed template downloads immediately for cardholders to fill in
              (<em>Expense Type</em> and <em>Ministry</em> columns are left blank).
            </div>
            <CreditCardUploader />
          </>
        )}

        {tab === "resolved" && (
          <>
            <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 leading-normal">
              Once cardholders have filled in the <em>Expense Type</em> and <em>Ministry</em> columns, drop the completed
              CSV here to get back the same report — every original column intact — with the rules applied to{" "}
              <em>Accountant Use: Final Expense Type</em> and <em>Accountant Use: Final Ministry Type</em>.
              Review it, fix whatever the rules got wrong, then take it to step 3.
            </div>
            <CreditCardResolvedReport />
          </>
        )}

        {tab === "aplos" && (
          <>
            <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 leading-normal">
              Drop the resolved report from step 2 — edits and all. The two <em>Accountant Use</em> columns are taken as
              final: whatever account and ministry you left in them is what posts, rules are not re-run over them.
              Merchants get normalized (Amazon variants → Amazon, etc.) and amounts are inverted for Aplos.
              Output is an XLSX matching the Square import format.
            </div>
            <CreditCardAplosImporter />
          </>
        )}
      </div>
    </>
  );
}
