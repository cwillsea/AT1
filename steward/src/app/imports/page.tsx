import path from "node:path";
import { type NameTable } from "@/components/PayoutCard";
import { DepositList } from "@/components/DepositList";
import { SourceChip } from "@/components/SourceChip";
import { fmtUSD } from "@/lib/fmt";
import { loadAllDeposits } from "@/lib/square-csv";
import { loadAplosNames } from "@/lib/aplos-lookup";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic"; // always fresh; CSVs change on sync

export default async function ImportsPage() {
  const rules = await prisma.categorizationRule.findMany({ where: { source: "square" } });

  let deposits, csvPaths;
  try {
    ({ deposits, csvPaths } = loadAllDeposits(rules));
  } catch (e) {
    return (
      <div className="px-8 py-6">
        <div className="font-display text-[28px] text-clay font-medium">No Square CSV found</div>
        <p className="mt-3 font-ui text-[13px] text-ink2 max-w-lg">
          Looked in <code className="font-mono text-[11.5px]">square/deposits/</code>. Click{" "}
          <strong>Sync data</strong> in the top bar to fetch from Square, or run{" "}
          <code className="font-mono text-[11.5px]">cd square && node index.js</code> manually.
        </p>
        <p className="mt-3 font-ui text-[11.5px] text-ink3">Error: {String(e)}</p>
      </div>
    );
  }

  const aplosNames = await loadAplosNames();
  const names: NameTable = {
    accounts: Object.fromEntries([...aplosNames.accounts.entries()].map(([k, v]) => [k, v.name])),
    funds: Object.fromEntries(aplosNames.funds.entries()),
    tags: Object.fromEntries([...aplosNames.tags.entries()].map(([k, v]) => [k, v.name])),
  };
  const aplosEmpty = aplosNames.accounts.size === 0;

  const [manualMarks, deletedRows] = await Promise.all([
    prisma.manualMark.findMany({ where: { source: "square" } }),
    prisma.deletedDeposit.findMany({ where: { source: "square" } }),
  ]);
  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));

  const totalNet = deposits.reduce((s, d) => s + d.payoutAmount, 0);
  const totalItems = deposits.reduce((s, d) => s + d.itemCount, 0);
  const csvSummary = csvPaths.length === 1
    ? path.basename(csvPaths[0])
    : `${csvPaths.length} CSV files`;

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Square imports
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Square → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            Loaded from <span className="font-mono">{csvSummary}</span>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">pending</div>
            <div className="font-display text-[18px] text-ink mt-0.5 font-medium">
              {deposits.length} deposits · {totalItems} items
            </div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">net to post</div>
            <div className="font-display text-[18px] text-forest mt-0.5 font-medium">
              {fmtUSD(totalNet, { sign: true })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-5 flex flex-col gap-3.5">
        <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 grid grid-cols-[auto_1fr_auto] gap-4 items-center">
          <div className="flex items-center gap-1.5">
            <SourceChip src="square" />
          </div>
          <div className="font-ui text-[12.5px] text-ink2 leading-normal">
            Square bundles many small sales into one deposit. We open each deposit, auto-categorize the
            items, and post a single <strong>split entry</strong> to Aplos — income lines per
            account/fund/ministry, plus the Square fees, plus cash to Operating Checking.
          </div>
          <button className="px-3 py-1.5 rounded-full border border-line font-ui text-[11.5px] text-ink2 cursor-pointer">
            How matching works
          </button>
        </div>

        {aplosEmpty && (
          <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
            Aplos chart of accounts not synced yet — click <strong>Sync data</strong> in the top bar.
          </div>
        )}

        <DepositList
          deposits={deposits}
          names={names}
          initialMarkedKeys={[...manuallyPosted]}
          initialDeletedKeys={[...deletedSet]}
        />
      </div>
    </>
  );
}
