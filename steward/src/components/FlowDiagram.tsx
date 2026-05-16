import { SourceChip } from "./SourceChip";
import { fmtUSD } from "@/lib/fmt";

function Arrow() {
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" className="overflow-visible">
      <line x1="2" x2="34" y1="10" y2="10" stroke="var(--color-line)" strokeWidth="1.5" />
      <path d="M 30 5 L 36 10 L 30 15" fill="none" stroke="var(--color-ink3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Two-lane Square → Aplos flow (bank deliberately omitted in this iteration).
export function FlowDiagram({
  totalGross,
  totalFees,
  itemCount,
  splitLineCount,
  payoutAmount,
}: {
  totalGross: number;
  totalFees: number;
  itemCount: number;
  splitLineCount: number;
  payoutAmount: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_40px_1fr] items-center bg-bg border border-line rounded-xl px-[18px] py-3.5">
      {/* Source */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <SourceChip src="square" />
          <span className="font-ui text-[11px] text-ink3">{itemCount} items</span>
        </div>
        <div className="font-display text-[22px] text-ink font-medium tracking-tight">
          {fmtUSD(totalGross)}
        </div>
        <div className="font-ui text-[10.5px] text-ink3 mt-0.5">
          gross · less {fmtUSD(totalFees)} Square fees = {fmtUSD(payoutAmount)} net
        </div>
      </div>
      <Arrow />
      {/* Book */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <SourceChip src="aplos" />
          <span className="font-ui text-[11px] text-honey font-semibold">not yet posted</span>
        </div>
        <div className="font-display text-[22px] text-ink font-medium tracking-tight">
          {splitLineCount} income split{splitLineCount === 1 ? "" : "s"}
        </div>
        <div className="font-ui text-[10.5px] text-ink3 mt-0.5">
          + 1 fee line + cash to Operating Checking
        </div>
      </div>
    </div>
  );
}
