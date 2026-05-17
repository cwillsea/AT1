import { CreditCardUploader } from "@/components/CreditCardUploader";

export default function CreditCardPage() {
  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Credit card
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Truist → Expense Report
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            Drop a Truist commercial card export and get a formatted expense-report CSV back.
          </div>
        </div>
      </div>

      <div className="px-8 py-5 flex flex-col gap-3.5">
        <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2 leading-normal">
          Download your CSV from Truist Online Banking under <strong>Commercial Card → Transaction Details → Download</strong>.
          Drop it below — the transformed file downloads immediately.
          Columns left blank (<em>Expense Type</em>, <em>Ministry</em>) are for cardholders to fill in before returning to the accountant.
        </div>

        <CreditCardUploader />
      </div>
    </>
  );
}
