import { CreditCardTabs } from "@/components/CreditCardTabs";

export default function CreditCardPage() {
  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Credit card
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Truist → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            Three-step flow: generate a blank expense-report template for cardholders, resolve the completed report into
            reviewable account/ministry columns, then turn the reviewed file into an Aplos import.
          </div>
        </div>
      </div>

      <CreditCardTabs />
    </>
  );
}
