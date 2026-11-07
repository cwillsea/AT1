import { PayrollList } from "@/components/PayrollList";
import { PayrollUploader } from "@/components/PayrollUploader";
import { GenerateImportButton } from "@/components/GenerateImportButton";
import { type NameTable } from "@/components/PayoutCard";
import { fmtUSD } from "@/lib/fmt";
import { loadAllPayrollBatches, loadPayrollRules } from "@/lib/payroll-csv-server";
import { loadAplosNames } from "@/lib/aplos-lookup";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const [rules, accountRows, fundRows, tagRows, manualMarks, deletedRows, aplosNames] = await Promise.all([
    loadPayrollRules(),
    prisma.account.findMany({ orderBy: { accountNumber: "asc" } }),
    prisma.fund.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.manualMark.findMany({ where: { source: "payroll" } }),
    prisma.deletedDeposit.findMany({ where: { source: "payroll" } }),
    loadAplosNames(),
  ]);

  const { batches, csvPaths } = loadAllPayrollBatches(rules);

  const accountOptions = accountRows.map((a) => ({ number: a.accountNumber, name: a.name, category: a.category }));
  const fundOptions = fundRows.map((f) => ({ id: f.id, name: f.name }));
  const tagOptions = tagRows.map((t) => ({ id: t.id, name: t.name, category: t.category }));
  const names: NameTable = {
    accounts: Object.fromEntries([...aplosNames.accounts.entries()].map(([k, v]) => [k, v.name])),
    funds: Object.fromEntries(aplosNames.funds.entries()),
    tags: Object.fromEntries([...aplosNames.tags.entries()].map(([k, v]) => [k, v.name])),
  };

  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));
  const pending = batches.filter((b) => !manuallyPosted.has(b.id) && !deletedSet.has(b.id));
  const totalOut = pending.reduce((s, b) => s + b.amount, 0);
  const anyUnmatched = pending.some((b) => b.recipients.some((r) => r.accountNumber === 0));

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Payroll imports
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Payroll → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            {csvPaths.length === 0
              ? "No payroll CSVs uploaded yet"
              : `Loaded from ${csvPaths.length} CSV file${csvPaths.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <GenerateImportButton endpoint="/api/payroll/export" blockedByUnmatched={anyUnmatched} />
          <div className="w-px h-8 bg-line" />
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">pending</div>
            <div className="font-display text-[18px] text-ink mt-0.5 font-medium">
              {pending.length} batch{pending.length === 1 ? "" : "es"}
            </div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">payroll to post</div>
            <div className="font-display text-[18px] text-clay mt-0.5 font-medium">
              {fmtUSD(-totalOut)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-5 flex flex-col gap-3.5">
        {aplosNames.accounts.size === 0 && (
          <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
            Aplos chart of accounts not synced yet — click <strong>Sync data</strong> in the top bar.
          </div>
        )}

        <PayrollUploader />

        {/* PayrollList keeps batches in local state, so remount it when an
            upload (router.refresh) brings in a different set of batches. */}
        <PayrollList
          key={batches.map((b) => b.id).join(",")}
          batches={batches}
          names={names}
          initialMarkedKeys={[...manuallyPosted]}
          initialDeletedKeys={[...deletedSet]}
          initialRules={rules}
          accounts={accountOptions}
          funds={fundOptions}
          tags={tagOptions}
        />
      </div>
    </>
  );
}
