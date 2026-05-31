import path from "node:path";
import { SourceChip } from "@/components/SourceChip";
import { TransferList } from "@/components/TransferList";
import { SubsplashUploader } from "@/components/SubsplashUploader";
import { fmtUSD } from "@/lib/fmt";
import { loadAllTransfers, getTransfersDir } from "@/lib/subsplash-csv";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubsplashPage() {
  let transfers: ReturnType<typeof loadAllTransfers>["transfers"] = [];
  let csvPaths: string[] = [];
  let loadError: string | null = null;
  try {
    const result = loadAllTransfers();
    transfers = result.transfers;
    csvPaths = result.csvPaths;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const [manualMarks, deletedRows, giftRules, paymentRules, purposes, accounts, funds, tags] = await Promise.all([
    prisma.manualMark.findMany({ where: { source: "subsplash" } }),
    prisma.deletedDeposit.findMany({ where: { source: "subsplash" } }),
    prisma.categorizationRule.findMany({ where: { source: "subsplash-gift" } }),
    prisma.categorizationRule.findMany({ where: { source: "subsplash-payment" } }),
    prisma.purpose.findMany(),
    prisma.account.findMany(),
    prisma.fund.findMany(),
    prisma.tag.findMany(),
  ]);

  const purposeById = new Map(purposes.map((p) => [p.id, p.name]));
  const giftFundToPurpose = new Map(
    giftRules
      .filter((r) => r.purposeId !== null)
      .map((r) => [r.pattern, purposeById.get(r.purposeId!) ?? null])
  );

  type PaymentTarget = { accountNumber: number; fundId: number; tagId: number };
  const paymentSourceToTarget = new Map<string, PaymentTarget>(
    paymentRules
      .filter((r) => r.accountNumber && r.fundId && r.tagId)
      .map((r) => [r.pattern, { accountNumber: r.accountNumber!, fundId: r.fundId!, tagId: r.tagId! }])
  );

  const names = {
    accounts: Object.fromEntries(accounts.map((a) => [a.accountNumber, a.name])),
    funds: Object.fromEntries(funds.map((f) => [f.id, f.name])),
    tags: Object.fromEntries(tags.map((t) => [t.id, t.name])),
  };
  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));

  const totalNet = transfers.reduce((s, t) => s + t.transferAmount, 0);
  const totalGifts = transfers.reduce((s, t) => s + t.giftCount, 0);
  const totalPayments = transfers.reduce((s, t) => s + t.paymentCount, 0);
  const dirHint = path.relative(path.resolve(process.cwd(), ".."), getTransfersDir());

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Subsplash imports
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Subsplash → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            Loaded {csvPaths.length} CSV file{csvPaths.length === 1 ? "" : "s"} from <span className="font-mono">{dirHint}/</span>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">pending</div>
            <div className="font-display text-[18px] text-ink mt-0.5 font-medium">
              {transfers.length} transfer{transfers.length === 1 ? "" : "s"} · {totalGifts} gifts · {totalPayments} payments
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
        <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 grid grid-cols-[auto_1fr] gap-4 items-center">
          <SourceChip src="subsplash" />
          <div className="font-ui text-[12.5px] text-ink2 leading-normal">
            Each Subsplash transfer becomes one bank deposit. We split it into two posts to Aplos:{" "}
            <strong>gifts</strong> become a <em>contribution batch</em> (purpose-aware, donor-grouped), and{" "}
            <strong>payments</strong> (events, classes, merch) become a <em>register transaction</em> with
            split lines per payment source.
          </div>
        </div>

        <SubsplashUploader />

        {loadError && (
          <div className="bg-clay-soft border border-clay/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
            <strong>Could not load transfers:</strong> {loadError}
          </div>
        )}

        {!loadError && transfers.length === 0 && (
          <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
            No transfers yet. Drop gifts-*.csv / payments-*.csv files (or a zip containing them) into the
            uploader above. Files are saved to <span className="font-mono">{dirHint}/</span>.
          </div>
        )}

        <TransferList
          transfers={transfers}
          initialMarkedKeys={[...manuallyPosted]}
          initialDeletedKeys={[...deletedSet]}
          giftFundToPurpose={Object.fromEntries(giftFundToPurpose)}
          paymentSourceToTarget={Object.fromEntries(paymentSourceToTarget)}
          names={names}
        />
      </div>
    </>
  );
}
